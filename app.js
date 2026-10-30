const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");

const app = express();
app.engine("ejs",ejsMate);
app.set("view engine","ejs");
app.set("views", path.join(__dirname, "views"));
app.get("/",(req, res) => {
        res.render(
            "home"
        );
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});