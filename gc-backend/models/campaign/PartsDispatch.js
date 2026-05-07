const mongoose = require('mongoose');

const PartsDispatchSchema = new mongoose.Schema(
  {
    'Plant': mongoose.Schema.Types.Mixed,
    'Plant Description': { type: String, trim: true },
    'Material No': mongoose.Schema.Types.Mixed,
    'Material Description': { type: String, trim: true },
    'PO Number': Number,
    'Order Quantity': Number,
    'Original Receive Quantity': { type: Number, default: null },
    'GR Quantity': { type: Number, default: null },
    'PO Date': { type: Date, default: null },
    'Dispatch Date': { type: Date, default: null },
    'NRGP/Challan Number': mongoose.Schema.Types.Mixed,
    'Docket Number': mongoose.Schema.Types.Mixed,
    'Transporter Name': { type: String, trim: true },
    'Campaign Short Desc': { type: String, trim: true, default: null },
    'Region': { type: String, trim: true },
    'Area Office': { type: String, trim: true },
  },
  { timestamps: true, strict: false, versionKey: false }
);

module.exports = mongoose.model('PartsDispatch', PartsDispatchSchema);
