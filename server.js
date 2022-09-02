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
const sleep = require('sleep-promise');
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

app.use(express.static('uploads'));
app.use(express.static('public'));
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

router.post('/post-image', upload.single('file'), async function (req, res) {
    const tempPath = req.file.path;
    const pdfFileName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".pdf";
    const targetPath = path.join(__dirname, "./uploads/" + pdfFileName);
    const tempJpgImage = './uploads/temp.jpg';
    const tempPngImage = './uploads/temp.png';
    
    if (path.extname(req.file.originalname).toLowerCase() === ".png" || path.extname(req.file.originalname).toLowerCase() === ".jpg" || path.extname(req.file.originalname).toLowerCase() === ".jpeg") {
        const pages = [ tempPath ];
        try {
            await imgToPDF(pages, 'A4').pipe(fs.createWriteStream(targetPath));
            res.send('/uploads/' + pdfFileName);
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }        
    } else if (path.extname(req.file.originalname).toLowerCase() === ".pdf") {
        try {
            await fs.copyFileSync(tempPath, targetPath);
            res.send('/uploads/' + pdfFileName);
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
                res.send('/uploads/' + pdfFileName);                
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
            res.send('/uploads/' + pdfFileName);
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
                res.send('/uploads/' + pdfFileName);
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

cron.schedule('*/2 * * * *', async () => {
    console.log('Cron Started!!!');
    let updatedProductIds = await findUpdatedProductIds();
    let params = {};
    if (!updatedProductIds) {
        updatedProductIds = {};
    }

    if (updatedProductIds && (updatedProductIds.CurrentProductID != updatedProductIds.UpdatedProductID || updatedProductIds.CurrentProductID != updatedProductIds.LastUpdatedProductID)) {
        params = { fields: 'id,vendor,variants', limit: 1, since_id: updatedProductIds.CurrentProductID };
    } else {        
        params = { fields: 'id,vendor,variants', limit: 1 };
    }

    shopify.product.list(params).then(
        async (products) => {
            //console.time('doSomething');
            if (products) {
                let product = products[0];

                (updatedProductIds.UpdatedProductID !== null) ? updatedProductIds.LastUpdatedProductID = updatedProductIds.UpdatedProductID : updatedProductIds.LastUpdatedProductID = "";
                (updatedProductIds.CurrentProductID !== null) ? updatedProductIds.UpdatedProductID = updatedProductIds.CurrentProductID : updatedProductIds.UpdatedProductID = "";
                updatedProductIds.CurrentProductID = product.id;
                saveUpdatedProductIds(updatedProductIds);

                switch (product.vendor) {
                    case 'S&S':
                        let sku_arr = [];
                        let updated = false;
                        let remote_products;

                        for (let index=0;index<product.variants.length;index++) {
                            sku_arr.push(product.variants[index].sku);
                        }

                        try {
                            remote_products = await getProductsFromSSActiveWear(sku_arr);
                        } catch {
                        }
                        if (remote_products) {
                            try {
                                updateProductFromSSActiveWear(product, remote_products, 0);
                            } catch (error) {
                                console.log(error);
                            }
                        }
                        break;
                }
            }
            //console.timeEnd('doSomething');
        },
        (err) => {
            console.error(err);
        }
    );	
});