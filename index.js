const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
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
