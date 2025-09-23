const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d4gmgst.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db("marketDB").collection("users");
    const productsCollection = client.db("marketDB").collection("products");

    // api to update product price
    app.patch("/products/:id/price", async (req, res) => {
      try {
        const { id } = req.params;
        const { price } = req.body;

        if (!price)
          return res.status(400).send({ message: "Price is required" });

        const today = new Date().toISOString().split("T")[0];

        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!product)
          return res.status(404).send({ message: "Product not found" });

        const existingIndex = product.prices.findIndex((p) => p.date === today);

        const updateQuery =
          existingIndex !== -1
            ? {
                $set: {
                  [`prices.${existingIndex}.price`]: price,
                  price_per_unit: price,
                },
              }
            : {
                $push: { prices: { date: today, price } },
                $set: { price_per_unit: price },
              };

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateQuery
        );

        res.send({ success: true, message: "Price updated", result });
      } catch (error) {
        console.error("Error updating price:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to get single product
    app.get("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product)
          return res.status(404).send({ message: "Product not found" });

        res.send(product);
      } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to add products
    app.post("/products", async (req, res) => {
      try {
        const product = req.body;

        if (
          !product.vendor_email ||
          !product.vendor_name ||
          !product.market_name ||
          !product.date ||
          !product.market_description ||
          !product.item_name ||
          !product.image_url ||
          !product.price_per_unit
        ) {
          return res.status(400).send({ message: "All fields are required" });
        }

        product.prices = [
          {
            date: product.date,
            price: product.price_per_unit,
          },
        ];

        product.status = "pending";
        product.created_at = new Date();

        const result = await productsCollection.insertOne(product);

        res.status(201).send({
          message: "Product added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to get specific vendor's all products
    app.get("/products/vendor/:email", async (req, res) => {
      try {
        const email = req.params.email?.toLowerCase().trim();

        if (!email) {
          return res.status(400).send({ message: "Vendor email is required" });
        }

        const products = await productsCollection
          .find({ vendor_email: email })
          .sort({ created_at: -1 }) // newest first
          .toArray();

        res.send(products);
      } catch (error) {
        console.error("Error fetching vendor products:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to add new user in db
    app.post("/users", async (req, res) => {
      try {
        const userData = req.body;

        if (!userData.user_email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const normalizedEmail = userData.user_email.toLowerCase();

        const existingUser = await usersCollection.findOne({
          user_email: normalizedEmail,
        });

        if (existingUser) {
          return res
            .status(200)
            .send({ message: "User already exists", user: existingUser });
        }

        const newUser = {
          ...userData,
          user_email: normalizedEmail,
          created_at: new Date(),
          last_login: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res
          .status(201)
          .send({ message: "User created successfully", user: result });
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to get current user role
    app.get("/users/role/:email", async (req, res) => {
      try {
        let email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        email = email.toLowerCase();

        const user = await usersCollection.findOne({ user_email: email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.user_role || "user" });
      } catch (error) {
        console.error("Error fetching role:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("market server is running");
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
