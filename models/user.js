const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    wardID: {
        type: Number,
        required: true
    },
    age: {
        type: Number,
        required: true,
        min: 0
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true,
        match: /^[0-9]{10}$/
    }
});


module.exports = mongoose.model("User", userSchema);