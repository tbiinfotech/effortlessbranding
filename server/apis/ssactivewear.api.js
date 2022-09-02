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

const getProductsFromSSActiveWear = async (sku_arr) => {
    const skus_str = sku_arr.join(',');
    let products;
    try {
        const response = await axios({
            method: 'get',
            url: `${SSACTIVEWEAR_GET_PRODUCT_API_URL}${skus_str}`,
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

const updateProductFromSSActiveWear = async (product, remote_products, index) => {
    if ( product.variants[index] ) {
        let remote_product = remote_products.find(obj => obj.sku == product.variants[index].sku);
        let new_qty = (!remote_product) ? 0 : remote_product.qty;

        if (new_qty != product.variants[index].inventory_quantity) {
            let variant_inventory;
            variant_inventory = await findVariantInventory(product.variants[index].id);
            
            if (variant_inventory) {
                await shopify.inventoryLevel.set({location_id: variant_inventory.LocationId, inventory_item_id: variant_inventory.InventoryItemId, available: new_qty});
            } else {
                let inventory_item_id = product.variants[index].inventory_item_id;
                let inventory_level = await shopify.inventoryLevel.list({inventory_item_ids: inventory_item_id});
                if (inventory_level) {
                    let location_id = inventory_level[0].location_id;
                    await saveVariantInventory({VariantID: product.variants[index].id, InventoryItemId: inventory_item_id, LocationId: location_id});
                    shopify.inventoryLevel.set({location_id: location_id, inventory_item_id: inventory_item_id, available: new_qty});
                }
            }
        }

        setTimeout(updateProductFromSSActiveWear, 1000, product, remote_products, ++index);
    }
}

module.exports = {getProductsFromSSActiveWear, postOrderToSSActiveWear, updateProductFromSSActiveWear};