require('isomorphic-fetch');
const dotenv = require('dotenv');
dotenv.config();

const {
  DB_CONNECTION_STRING
} = process.env;

const mongoose = require('mongoose');
const initDB = () => {
  mongoose.connect(DB_CONNECTION_STRING);
  mongoose.connection.once('open', () => { 
    console.log('connected to database'); 
  }); 
  
  mongoose.connection.on('error', console.error); 
}

module.exports = initDB;