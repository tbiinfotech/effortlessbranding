require('isomorphic-fetch');
const dotenv = require('dotenv');
dotenv.config();
const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const app = express();
const Shopify = require('shopify-api-node');
const initDB = require('./server/database');
const {findUpdatedProductIds, saveUpdatedProductIds} = require('./server/services/updated_product_id.service');
const {findVariantInventory, saveVariantInventory} = require('./server/services/variant_inventory.service');
const {getProductsFromSSActiveWear, postOrderToSSActiveWear, updateProductFromSSActiveWear} = require('./server/apis/ssactivewear.api');
// const sleep = require('sleep-promise');
//const log = require('log-to-file');
const cron = require('node-cron');
const multer = require("multer");
const fs = require('fs');
const imgToPDF = require('image-to-pdf');
const cors = require('cors');
const path = require('path');
const Jimp = require('jimp');
const gifFrames = require('gif-frames');
const PSD = require('psd');

const delay = (ms) => {
    const date = Date.now();
    let currentDate = null;
 
    do {
        currentDate = Date.now();
    } while (currentDate - date < ms);
}

const {
    SHOPIFY_API_TOCKEN,
    SHOPNAME,
    SSACTIVEWEAR_API_MODE
} = process.env;

const shopify = new Shopify({
    shopName: SHOPNAME,
    accessToken: SHOPIFY_API_TOCKEN
});

const upload = multer({
    dest: "./public"
});

app.use("/uploads", express.static(path.resolve(__dirname + '/uploads')));
app.use("/public", express.static(path.resolve(__dirname + '/public')));
app.use(cors({
    origin: '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(bodyParser.urlencoded({
    extended: true
}));

// initDB();

router.get('/', (req, res) => {
  res.send('Hello World!');
});

router.post('/webhook-orders', async (req, res) => {
    const shopify_order = req.body;
    let ssactivewear_order = {
        testOrder: true,
        autoselectWarehouse: true,
        shippingAddress: {},
        shippingMethod: 1,
        lines: []
    };
    if (SSACTIVEWEAR_API_MODE == 'LIVE') {
        ssactivewear_order.testOrder = false;
    }
    
    for (let index=0;index<shopify_order.line_items.length;index++) {
        if (shopify_order.line_items[index].vendor == 'S&S') {
            ssactivewear_order.lines.push({identifier: shopify_order.line_items[index].sku, qty: shopify_order.line_items[index].quantity});
        }
    }
    if (ssactivewear_order.lines.length) {
        ssactivewear_order.shippingAddress = {
            customer: shopify_order.shipping_address.name,
            address: shopify_order.shipping_address.address1,
            city: shopify_order.shipping_address.city,
            state: shopify_order.shipping_address.province,
            zip: shopify_order.shipping_address.zip
        };

        postOrderToSSActiveWear(ssactivewear_order);
    }
    
    res.send('ok');
});

router.post('/webhook-carts', async (req, res) => {
    const shopify_cart = req.body;
    const quantity_split_edges = [1, 24, 48, 96, 144, 288, 500, 1000, 2500, 5000];
    const priceTable = [
        [2.9, 4.4, 5.85, 7],
        [2.15, 2.65, 3.35, 3.95, 4.95, 5.45, 6.15],
        [1.6, 2.2, 2.8, 3.4, 4, 4.6, 5.2],
        [1.25, 1.55, 1.85, 2.1, 2.4, 2.7, 3, 3.3],
        [1.1, 1.35, 1.6, 1.9, 2.15, 2.4, 3.5, 4.1],
        [0.9, 1.15, 1.25, 1.4, 1.6, 1.8, 2.08, 2.35],
        [0.8, 0.88, 0.96, 1.08, 1.18, 1.38, 1.52, 1.68],
        [0.7, 0.76, 0.85, 0.95, 1.05, 1.2, 1.35, 1.5],
        [0.62, 0.7, 0.78, 0.85, 0.95, 1.05, 1.2, 1.3],
        [0.55, 0.6, 0.68, 0.75, 0.85, 0.95, 1.05, 1.15]
    ];
    let products_list = [];

    for(let i = 0; i < shopify_cart.line_items.length; i++) {
        const item = shopify_cart.line_items[i];
        if(item.properties && item.properties['_Create Order']) {
            let discounted_price = 0.0;
            let item_price = 0.0;
            for (const [key, value] of Object.entries(item.properties)) {
                if(key.includes(' Color')) {
                    const colors_index = parseInt(value.replace(" Colors", "")) - 1;
                    let quantiy_index = 0;

                    quantity_split_edges.forEach((edge, index) => {
                        if(item.quantity >= edge) quantiy_index = index;
                    });
                    if(priceTable[quantiy_index][colors_index]) {
                        const orderProductPrice = priceTable[quantiy_index][colors_index];
                        item_price += (parseFloat(item.line_price) + orderProductPrice * item.quantity);
                        discounted_price += (parseFloat(item.line_price) + orderProductPrice * item.quantity) * 0.6;
                        products_list.push(item.variant_id);
                    }
                }
            }
            if(discounted_price > 0) {
                console.log(item_price, discounted_price);
                console.log({
                    "title": `CreateOrderDiscount - ${ item.properties['_Create Order'] }`,
                    "target_type": "line_item",
                    "target_selection": "entitled",
                    "allocation_method": "across",
                    "value_type": "fixed_amount",
                    "value": `${ parseFloat(discounted_price - item_price).toFixed(2) }`,
                    "customer_selection": "all",
                    "entitled_variant_ids": products_list,
                    "starts_at": new Date().toISOString()
                });
                await shopify.priceRule.create({
                    "title": `CreateOrderDiscount - ${ item.properties['_Create Order'] }`,
                    "target_type": "line_item",
                    "target_selection": "entitled",
                    "allocation_method": "across",
                    "value_type": "fixed_amount",
                    "value": `${ parseFloat(discounted_price - item_price).toFixed(2) }`,
                    "customer_selection": "all",
                    "entitled_variant_ids": products_list,
                    "starts_at": new Date().toISOString()
                });
            }
        }
    }

    res.send('ok');
});

router.post('/post-image', upload.single('file'), async function (req, res) {
    const tempPath = req.file.path;
    const targetFileName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const pdfFileName = targetFileName + ".pdf";
    const targetPath = path.join(__dirname, "./uploads/" + pdfFileName);
    let targetImagePath;
    const tempJpgImage = './uploads/temp.jpg';
    const tempPngImage = './uploads/temp.png';
    
    if (path.extname(req.file.originalname).toLowerCase() === ".png" || path.extname(req.file.originalname).toLowerCase() === ".jpg" || path.extname(req.file.originalname).toLowerCase() === ".jpeg") {
        const pages = [ tempPath ];
        try {
            const result = await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
            targetImagePath = path.join(__dirname, "./uploads/" + targetFileName + path.extname(req.file.originalname).toLowerCase());
            await fs.copyFile(tempPath, targetImagePath, (err) => {
                if(err) {
                    console.log("Error Found: ", err);
                }
            });
            res.send({'pdf_url': '/uploads/' + pdfFileName, 'img_url': '/uploads/' + targetFileName + path.extname(req.file.originalname).toLowerCase()});
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }        
    } else if (path.extname(req.file.originalname).toLowerCase() === ".pdf") {
        try {
            await fs.copyFileSync(tempPath, targetPath);
            res.send({'pdf_url': '/uploads/' + pdfFileName});
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    } else if (path.extname(req.file.originalname).toLowerCase() === ".ai") {

    } else if (path.extname(req.file.originalname).toLowerCase() === ".eps") {

    } else if (path.extname(req.file.originalname).toLowerCase() === ".gif") {
        const frameData = await gifFrames({ url: tempPath, frames: 0, outputType: 'jpg' });
        try {
            const stream = await frameData[0].getImage().pipe(fs.createWriteStream(tempJpgImage));
            stream.on('finish', async () => {                
                const pages = [ tempJpgImage ];
                targetImagePath = path.join(__dirname, "./uploads/" + targetFileName + '.jpg');
                await fs.copyFile(tempJpgImage, targetImagePath, (err) => {
                    if(err) {
                        console.log("Error Found: ", err);
                    }
                });
                await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
                res.send({'pdf_url': '/uploads/' + pdfFileName, 'img_url': '/uploads/' + targetFileName + '.jpg'});              
            });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }        
    } else if (path.extname(req.file.originalname).toLowerCase() === ".bmp") {
        try {
            const bmpImage = await Jimp.read(tempPath);            
            await bmpImage.write(tempJpgImage);

            targetImagePath = path.join(__dirname, "./uploads/" + targetFileName + '.jpg');
            await fs.copyFile(tempJpgImage, targetImagePath, (err) => {
                if(err) {
                    console.log("Error Found: ", err);
                }
            });
         
            const pages = [ tempJpgImage ];
            await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
            res.send({'pdf_url': '/uploads/' + pdfFileName, 'img_url': '/uploads/' + targetFileName + '.jpg'});
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    } else if (path.extname(req.file.originalname).toLowerCase() === ".psd") {
        try {
            // You can also use promises syntax for opening and parsing
            PSD.open(tempPath).then(function (psd) {
                return psd.image.saveAsPng(tempPngImage);
            }).then( async () => {
                const pages = [ tempPngImage ];
                targetImagePath = path.join(__dirname, "./uploads/" + targetFileName + '.png');
                await fs.copyFile(tempPngImage, targetImagePath, (err) => {
                    if(err) {
                        console.log("Error Found: ", err);
                    }
                });
                await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
                res.send({'pdf_url': '/uploads/' + pdfFileName, 'img_url': '/uploads/' + targetFileName + '.png'});
            });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    } else {
      fs.unlink(tempPath, err => {
        if (err) return handleError(err, res);

        res
          .status(403)
          .contentType("text/plain")
          .end("This file type is not allowed!");
      });
    }
});

router.get('/order-test', async (req, res) => {
    res.send('OK');
});

app.use('/', router);

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
router.get('/inventory-synchronize', async (req, res) => {
    let params = { fields: 'id,vendor,variants', limit: 1 };
    do {
        const products = await shopify.product.list(params);
        let inventory_items = [];
        let sku_arr = [];
        let remote_products;

        console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++");

        products.forEach(async (product) => {
            switch (product.vendor) {
                case 'S&S':
                    if(product.variants.length) {

                        product.variants.forEach(variant => {
                            if(variant.sku) {
                                inventory_items.push({
                                    sku: variant.sku,
                                    variant_id: variant.id,
                                    inventory_item_id: variant.inventory_item_id,
                                    inventory_quantity: variant.inventory_quantity
                                })
                                sku_arr.push(variant.sku);
                            }
                        });
                    }
                    break;
            }
        });
        await sleep(1000);

        if(sku_arr.length) {
            try {
                remote_products = await getProductsFromSSActiveWear(sku_arr);
            } catch {
            }

            if (remote_products) {
                await updateProductFromSSActiveWear(remote_products, inventory_items);
            }
        }

        params = products.nextPageParameters;
        await sleep(1000);
    } while (params !== undefined);
});

cron.schedule('0 0 0 */1 * *', async () => {
    console.log('Cron Started!!!');
    let params = { fields: 'id,vendor,variants', limit: 1 };
    do {
        const products = await shopify.product.list(params);
        let inventory_items = [];
        let sku_arr = [];
        let remote_products;

        console.log("++++++++++++++++++++++++++++++++++++++++++++++++++++++++");

        products.forEach(async (product) => {
            switch (product.vendor) {
                case 'S&S':
                    if(product.variants.length) {

                        product.variants.forEach(variant => {
                            if(variant.sku) {
                                inventory_items.push({
                                    sku: variant.sku,
                                    variant_id: variant.id,
                                    inventory_item_id: variant.inventory_item_id,
                                    inventory_quantity: variant.inventory_quantity
                                })
                                sku_arr.push(variant.sku);
                            }
                        });
                    }
                    break;
            }
        });
        await sleep(1000);

        if(sku_arr.length) {
            try {
                remote_products = await getProductsFromSSActiveWear(sku_arr);
            } catch {
            }

            if (remote_products) {
                await updateProductFromSSActiveWear(remote_products, inventory_items);
            }
        }

        params = products.nextPageParameters;
        await sleep(1000);
    } while (params !== undefined);
    console.log('Cron Ended!!!');
});