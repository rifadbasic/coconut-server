const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(cors());
app.use(express.json());

// Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xrkcnh7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("coconutDB");
    const coconutCollection = database.collection("products");

    //back office api start here

    // ✅ Get all products with pagination support
    app.get("/products", async (req, res) => {
      try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1; // frontend starts at 1
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // build query
        const query = search ? { name: { $regex: search, $options: "i" } } : {};

        const totalProducts = await coconutCollection.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await coconutCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          success: true,
          products,
          totalPages,
          currentPage: page,
        });
      } catch (error) {
        console.error("❌ Error fetching products:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch products" });
      }
    });

    
    // ✅ Add Product API
    app.post("/products", async (req, res) => {
      try {
        const product = req.body;
        const result = await coconutCollection.insertOne(product);
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to add product" });
      }
    });

    // 🔹 Update product
    app.put("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const updateData = req.body;
        delete updateData._id;

        const result = await coconutCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0)
          return res.status(404).json({ message: "Product not found" });

        res.json({ success: true, message: "Product updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to update product" });
      }
    });

    // 🔹 Delete product
    app.delete("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const result = await coconutCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Product not found" });

        res.json({ success: true, message: "Product deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to delete product" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Coconut server is running");
});

app.listen(port, () => {
  console.log(`Coconut server is running on port: ${port}`);
});
