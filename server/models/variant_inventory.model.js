const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VariantInventorySchema = new Schema({
    VariantID: String,
    InventoryItemId: String,
    LocationId: String
});

module.exports = mongoose.model('Variant_Inventory', VariantInventorySchema);