const Variant_Inventory = require('../models/variant_inventory.model');

const saveVariantInventory = async (variant_inventory) => {
	await Variant_Inventory.create(variant_inventory);
	return true; 
};

const findVariantInventory = async (variant_id) => {
	const variant_inventory =  await Variant_Inventory.findOne({VariantID: variant_id});
    return variant_inventory;
}

module.exports = { findVariantInventory, saveVariantInventory };