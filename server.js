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

initDB();

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

    console.log(shopify_cart);
    
    res.send('ok');
});

router.post('/post-image', upload.single('file'), async function (req, res) {
    const tempPath = req.file.path;
    const pdfFileName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".pdf";
    const targetPath = path.join(__dirname, "./uploads/" + pdfFileName);
    const tempJpgImage = './uploads/temp.jpg';
    const tempPngImage = './uploads/temp.png';
    
    if (path.extname(req.file.originalname).toLowerCase() === ".png" || path.extname(req.file.originalname).toLowerCase() === ".jpg" || path.extname(req.file.originalname).toLowerCase() === ".jpeg") {
        const pages = [ tempPath ];
        try {
            const result = await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
            res.send({'pdf_url': '/uploads/' + pdfFileName});
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
                await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
                res.send({'pdf_url': '/uploads/' + pdfFileName});              
            });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }        
    } else if (path.extname(req.file.originalname).toLowerCase() === ".bmp") {
        try {
            const bmpImage = await Jimp.read(tempPath);            
            await bmpImage.write(tempJpgImage);
         
            const pages = [ tempJpgImage ];
            await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
            res.send({'pdf_url': '/uploads/' + pdfFileName});
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
                await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
                res.send({'pdf_url': '/uploads/' + pdfFileName});
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

// router.get('/webhook-orders', async (req, res) => {
//     if (SSACTIVEWEAR_API_MODE == 'TEST') {
//         console.log(true);
//     } else {
//         console.log(false);
//     }
//     res.send('ok');
// });

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

cron.schedule('0 0 */2 * * *', async () => {
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