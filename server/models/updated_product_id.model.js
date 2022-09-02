const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UpdatedProductIdSchema = new Schema({
    CurrentProductID: String,
    UpdatedProductID: String,
    LastUpdatedProductID: String
});

module.exports = mongoose.model('Updated_Product_Id', UpdatedProductIdSchema);