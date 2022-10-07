require('isomorphic-fetch');
const { default: axios } = require('axios');
const dotenv = require('dotenv');
const {findVariantInventory, saveVariantInventory} = require('../services/variant_inventory.service');
const Shopify = require('shopify-api-node');
dotenv.config();

const {
    SHOPIFY_API_TOCKEN,
    SHOPNAME,    
    SSACTIVEWEAR_ACCOUNT_NUMBER,
    SSACTIVEWEAR_API_KEY,
    SSACTIVEWEAR_GET_PRODUCT_API_URL,
    SSACTIVEWEAR_POST_ORDER_API_URL
} = process.env;

const shopify = new Shopify({
    shopName: SHOPNAME,
    accessToken: SHOPIFY_API_TOCKEN
});

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const delay = async (ms) => {
    const date = Date.now();
    let currentDate = null;
 
    do {
        currentDate = Date.now();
    } while (currentDate - date < ms);
}

const getProductsFromSSActiveWear = async (sku_arr) => {
    const skus_str = sku_arr.join(',');
    let products;
    try {
        const response = await axios({
            method: 'get',
            url: `${SSACTIVEWEAR_GET_PRODUCT_API_URL}${skus_str}?fields=Sku,Qty`,
            auth: {
                username: SSACTIVEWEAR_ACCOUNT_NUMBER,
                password: SSACTIVEWEAR_API_KEY
            },

        });
        products = response.data;
    } catch(error) {
        products = false;
    }
    return products;
}

const postOrderToSSActiveWear = async (order) => {
    try {
        const response = await axios({
            method: 'post',
            url: `${SSACTIVEWEAR_POST_ORDER_API_URL}`,
            auth: {
                username: SSACTIVEWEAR_ACCOUNT_NUMBER,
                password: SSACTIVEWEAR_API_KEY
            },
            data: order
        });
        //console.log(response.data);
    } catch(error) {
        console.log(error);
    }
}

const updateProductFromSSActiveWear = async (remote_products, inventory_items) => {
    for (let index = 0; index < inventory_items.length; index++) {
        let inventoryItem =  inventory_items[index];
        try {
            let remote_product = remote_products.find(product => product.sku === inventoryItem.sku);
            let new_qty = (!remote_product) ? 0 : remote_product.qty;
            const levels = await shopify.inventoryLevel.list({
                limit: 50,
                inventory_item_ids: inventoryItem.inventory_item_id
            });
            await delay(1000);
            if(levels.length) {
                if(levels[0]["available"] !== undefined && levels[0]["location_id"] !== undefined) {
                    await shopify.inventoryLevel.adjust({
                        available_adjustment: (new_qty - levels[0].available),
                        inventory_item_id: inventoryItem.inventory_item_id,
                        location_id: levels[0].location_id
                    });
                    await delay(1000);
                    console.log("Variant - " , inventoryItem.sku, " is updated.");
                }
            }
        } catch (e) {
            console.log(e);
        } finally {
            console.log("--------------------------------------");
        }
    }
}

module.exports = {getProductsFromSSActiveWear, postOrderToSSActiveWear, updateProductFromSSActiveWear};