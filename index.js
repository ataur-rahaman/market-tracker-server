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
    const advertisementsCollection = client
      .db("marketDB")
      .collection("advertisements");

    // api to update product
    app.put("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;

        const today = new Date().toISOString().split("T")[0];

        // Find product first
        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }

        // Check if today's date already exists
        const existingIndex = product.prices.findIndex((p) => p.date === today);

        let updateDoc;
        if (existingIndex !== -1) {
          // ✅ Update existing record for today
          updateDoc = {
            $set: {
              [`prices.${existingIndex}.price`]: updatedData.price_per_unit,
              [`prices.${existingIndex}.updated_by`]:
                updatedData.updated_by || "vendor",
              price_per_unit: updatedData.price_per_unit,
              market_name: updatedData.market_name,
              market_description: updatedData.market_description,
              item_name: updatedData.item_name,
              image_url: updatedData.image_url,
              item_description: updatedData.item_description,
              last_updated: today,
            },
          };
        } else {
          // ✅ Push new record
          updateDoc = {
            $set: {
              price_per_unit: updatedData.price_per_unit,
              market_name: updatedData.market_name,
              market_description: updatedData.market_description,
              item_name: updatedData.item_name,
              image_url: updatedData.image_url,
              item_description: updatedData.item_description,
              last_updated: today,
            },
            $push: {
              prices: {
                date: today,
                price: updatedData.price_per_unit,
                updated_by: updatedData.updated_by || "vendor",
              },
            },
          };
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        res.send({ success: true, message: "Product updated", result });
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to get single product
    app.get("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        console.log(id);
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

    // api to delete single product
    app.delete("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send({ success: true, message: "Product deleted successfully" });
      } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //GET / products;
    app.get("/products", async (req, res) => {
      const items = await productsCollection
        .find({})
        .sort({ created_at: -1 })
        .toArray();
      res.send(items);
    });

    app.get("/approved-limited-products", async (req, res) => {
      try {
        const limit = 6; // number of markets you want

        const pipeline = [
          // 1. only approved
          { $match: { status: "approved" } },

          // 2. sort by latest updated first
          { $sort: { updated_at: -1 } },

          // 3. group by market → keep only the first product of each market
          {
            $group: {
              _id: "$market_name",
              product: { $first: "$$ROOT" },
            },
          },

          // 4. replace group result with the product itself
          { $replaceRoot: { newRoot: "$product" } },

          // 5. limit to 6 products (6 different markets max)
          { $limit: limit },
        ];

        const result = await productsCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching limited approved products:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // PATCH /products/:id/status  body: { status, reason?, feedback? }
    const { ObjectId } = require("mongodb");
    app.patch("/products/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status, reason = null, feedback = null } = req.body;

      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).send({ message: "Invalid status" });
      }

      const update = {
        $set: {
          status,
          rejection_reason: status === "rejected" ? reason : null,
          rejection_feedback: status === "rejected" ? feedback : null,
          updated_at: new Date(),
        },
      };

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send({ success: true, result });
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

    app.post("/advertisements", async (req, res) => {
      try {
        const ad = req.body;
        ad.status = "pending"; // enforce default
        ad.created_at = new Date();

        const result = await advertisementsCollection.insertOne(ad);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating advertisement:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/advertisements", async (_req, res) => {
      try {
        const ads = await advertisementsCollection
          .find({})
          .sort({ created_at: -1 })
          .toArray();
        res.send(ads);
      } catch (error) {
        console.error("Error fetching advertisements:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to get specific vendor's advertisements
    app.get("/advertisements/vendor/:email", async (req, res) => {
      try {
        const ads = await advertisementsCollection
          .find({ vendor_email: req.params.email })
          .toArray();
        res.send(ads);
      } catch (error) {
        console.error("Error fetching ads:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to update advertisement
    app.put("/advertisements/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { ad_title, description, image_url, status } = req.body;

        const updateDoc = {
          $set: {
            ...(ad_title !== undefined && { ad_title }),
            ...(description !== undefined && { description }),
            ...(image_url !== undefined && { image_url }),
            ...(status !== undefined && { status }),
            updated_at: new Date(),
          },
        };

        const result = await advertisementsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        res.send({
          success: result.matchedCount === 1 && result.modifiedCount >= 0,
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating ad:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // update advertisement status (Admin)
    app.patch("/advertisements/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "active", "paused", "rejected"].includes(status)) {
          return res.status(400).send({ message: "Invalid status" });
        }

        const result = await advertisementsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updated_at: new Date() } }
        );

        res.send({
          success: result.matchedCount === 1 && result.modifiedCount >= 0,
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating ad status:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // api to delete a single advertisement
    app.delete("/advertisements/:id", async (req, res) => {
      try {
        const result = await advertisementsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send({ success: result.deletedCount > 0 });
      } catch (error) {
        console.error("Error deleting ad:", error);
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

    // GET /users
    app.get("/users", async (req, res) => {
      const users = await usersCollection
        .find({})
        .sort({ user_email: 1 })
        .toArray();
      res.send(users);
    });

    // PATCH /users/:id/role
    app.patch("/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      if (!["user", "vendor", "admin"].includes(role)) {
        return res.status(400).send({ message: "Invalid role" });
      }
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { user_role: role } }
      );
      res.send({ success: true, result });
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
