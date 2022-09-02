const Updated_Product_Id = require('../models/updated_product_id.model');

const saveUpdatedProductIds = async (updatedProductIds) => {
	let doc = await Updated_Product_Id.findOneAndUpdate({ _id: { $exists: true } }, updatedProductIds, {
        new: true,
        upsert: true // Make this update into an upsert
    });
	return true; 
};

const findUpdatedProductIds = async () => {
	const updatedProductIds =  await Updated_Product_Id.findOne();
    return updatedProductIds;
}

module.exports = { findUpdatedProductIds, saveUpdatedProductIds };