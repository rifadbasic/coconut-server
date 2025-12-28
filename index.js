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

    const database = client.db("BeautyCareDB");
    const productCollection = database.collection("products");
    const orderCollection = database.collection("orders");

    //back office api start here

    // ✅ Get all products with pagination support for client-side
    app.get("/products", async (req, res) => {
      try {
        // ================= QUERY PARAMS =================
        const {
          search = "",
          page = 1,
          limit = 10,
          category,
          sort,
          status,
          brand,
        } = req.query;

        const currentPage = Math.max(parseInt(page), 1);
        const perPage = Math.max(parseInt(limit), 1);
        const skip = (currentPage - 1) * perPage;

        // ================= FILTER QUERY =================
        const query = {};

        // 🔍 Search by name (optional)
        if (search.trim()) {
          query.name = { $regex: search, $options: "i" };
        }

        // 🧴 Category filter (multiple)
        if (category) {
          query.category = {
            $in: category.split(","),
          };
        }

        // 🏷️ Brand filter (optional)
        if (brand) {
          query.brand = brand;
        }

        // 📦 Status filter (optional)
        if (status) {
          query.status = status;
        }

        // ================= SORT QUERY =================
        // First sort by stock descending (in-stock first)
        let sortQuery = { stock: -1, createdAt: -1 }; // default: in-stock first, then newest

        if (sort === "price_asc") {
          sortQuery = { stock: -1, finalPrice: 1 }; // in-stock first, then price low→high
        } else if (sort === "price_desc") {
          sortQuery = { stock: -1, finalPrice: -1 }; // in-stock first, then price high→low
        }

        // ================= COUNT =================
        const totalProducts = await productCollection.countDocuments(query);

        // ================= FETCH =================
        const products = await productCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(perPage)
          .toArray();

        // ================= PAGINATION =================
        const hasMore = skip + products.length < totalProducts;

        res.json({
          success: true,
          products,
          hasMore,
          currentPage,
          totalProducts,
        });
      } catch (error) {
        console.error("❌ Error fetching products:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch products",
        });
      }
    });

    // GET /products
    app.get("/items", async (req, res) => {
      try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // 🔍 Multi-field search condition
        const query = search
          ? {
              $or: [
                { name: { $regex: search, $options: "i" } },
                { category: { $regex: search, $options: "i" } },
                { status: { $regex: search, $options: "i" } },
              ],
            }
          : {};

        // 📦 Total count
        const totalCount = await productCollection.countDocuments(query);

        // 📄 Products
        const products = await productCollection
          .find(query)
          .sort({ createdAt: -1 }) // newest first
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          success: true,
          products,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch products",
        });
      }
    });

    // ✅ Get single product by ID
    app.get("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id))
          return res
            .status(400)
            .json({ success: false, message: "Invalid ID" });

        const product = await productCollection.findOne({
          _id: new ObjectId(id),
        });

        if (product) {
          res.json({ success: true, product });
        } else {
          res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }
      } catch (error) {
        console.error("❌ Error fetching product:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch product" });
      }
    });

    // get products by category
    app.get("/products/category", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};
        if (category) query.category = category;

        const products = await productCollection.find(query).toArray();
        res.json({ success: true, products });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch products" });
      }
    });

    // 🔍 Product Search API
    app.get("/search", async (req, res) => {
      try {
        const q = req.query.q;

        // ❗ NEVER throw 400 for search
        if (!q || !q.trim()) {
          return res.json({
            success: true,
            products: [],
          });
        }

        const products = await productCollection
          .find({
            name: { $regex: q.trim(), $options: "i" },
          })
          .limit(20)
          .toArray();

        res.json({
          success: true,
          products,
        });
      } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({
          success: false,
          message: "Search failed",
        });
      }
    });

    // ✅ Add Product
    app.post("/products", async (req, res) => {
      try {
        const {
          img,
          name,
          shortDesc,
          brand,
          country,
          category,
          stock = 0,
          price,
          discount = 0,
          status = "regular",
          description = [],
        } = req.body;

        // 🛑 Required validation
        if (!img || !name || price == null) {
          return res.status(400).json({
            success: false,
            message: "Image, Name & Price are required!",
          });
        }

        // 🔐 SAFE number casting
        const safePrice = Number(price);
        const safeDiscount = Number(discount);
        const safeStock = Number(stock);

        // 🔢 FINAL PRICE (server-controlled)
        const finalPrice = Math.max(
          safePrice - (safePrice * safeDiscount) / 100,
          0
        );

        // 🧼 Clean description list
        const cleanDescription = Array.isArray(description)
          ? description.filter((d) => d && d.trim() !== "")
          : [];

        // 📦 Build product object
        const newProduct = {
          img,
          name,
          shortDesc: shortDesc || "",
          brand: brand || "",
          country: country || "",
          category,
          stock: safeStock,
          price: safePrice,
          discount: safeDiscount,
          finalPrice: Number(finalPrice.toFixed(2)),
          status,
          description: cleanDescription,
          createdAt: new Date(),
        };

        // 💾 Insert into DB
        const result = await productCollection.insertOne(newProduct);

        res.status(201).json({
          success: true,
          message: "Product inserted successfully",
          insertedId: result.insertedId,
          product: newProduct,
        });
      } catch (error) {
        console.error("Product Save Error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to save product.",
        });
      }
    });

    // get all products
    app.get("/products/", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};
        if (category) query.category = category;

        const products = await productCollection.find(query).toArray();
        res.json({ success: true, products });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch products" });
      }
    });

    // 🔹 Update product WITHOUT saving finalPrice to DB
    app.put("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid product ID" });
        }

        const data = req.body;

        // ❌ Never trust client
        delete data._id;
        delete data.finalPrice;

        // 🧮 Normalize numbers
        data.stock = Number(data.stock);
        data.price = Number(data.price);
        data.discount = Number(data.discount);

        if (isNaN(data.stock) || isNaN(data.price)) {
          return res.status(400).json({ message: "Invalid numeric values" });
        }

        // 🧮 Calculate final price
        data.finalPrice = data.price - (data.price * data.discount) / 100;

        // 🔥 Update
        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: data }
        );

        if (!result.matchedCount) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.json({
          success: true,
          message: "Product updated successfully",
          finalPrice: data.finalPrice,
        });
      } catch (err) {
        console.error("Product update error:", err);
        res.status(500).json({ message: "Failed to update product" });
      }
    });

    // 🔹 Delete product
    app.delete("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const result = await productCollection.deleteOne({
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

    // --------------------------------------------

    // for order

    // orders API
    // 🔹 Create Order + Update Product Stock
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        // 🔐 Invoice check
        const existingInvoice = await orderCollection.findOne({
          invoiceNumber: order.invoiceNumber,
        });

        if (existingInvoice) {
          return res.status(400).send({
            success: false,
            message: "Invoice number already exists!",
          });
        }

        // 🔍 STOCK CHECK
        for (const item of order.cartItems) {
          const product = await productCollection.findOne({
            _id: new ObjectId(item.productId), // note: frontend sends productId
          });

          if (!product) {
            return res.status(404).send({
              success: false,
              message: `Product not found: ${item.name}`,
            });
          }

          const stock = Number(product.stock);
          const qty = Number(item.quantity);

          if (stock < qty) {
            return res.status(400).send({
              success: false,
              message: `Insufficient stock for ${item.name}`,
            });
          }
        }

        // ✅ SAVE ORDER
        const result = await orderCollection.insertOne({
          ...order,
          status: "pending",
          createdAt: new Date(),
        });

        // 🔻 SAFE STOCK UPDATE
        for (const item of order.cartItems) {
          await productCollection.updateOne(
            { _id: new ObjectId(item.productId) },
            [
              {
                $set: {
                  stock: {
                    $subtract: [{ $toInt: "$stock" }, Number(item.quantity)],
                  },
                },
              },
            ]
          );
        }

        res.send({
          success: true,
          orderId: result.insertedId,
          message: "Order placed successfully",
        });
      } catch (error) {
        console.error("❌ Order Error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to create order",
        });
      }
    });

    // ✅ Get all orders
    app.get("/orders", async (req, res) => {
      try {
        const search = req.query.search || "";
        const status = req.query.status || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = {};

        if (search) {
          query.$or = [
            { "customer.name": { $regex: search, $options: "i" } },
            { "customer.phone": { $regex: search, $options: "i" } },
            { invoiceNumber: { $regex: search, $options: "i" } },
            { status: { $regex: search, $options: "i" } },
          ];
        }

        if (status) {
          query.status = status;
        }

        const totalOrders = await orderCollection.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await orderCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          orders,
          totalPages,
          currentPage: page,
        });
      } catch (error) {
        console.error("❌ Error fetching orders:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch orders",
        });
      }
    });

    // 🔹 Update Order (FULL CONTROL)
    // 🔹 Update Order (NO STOCK CHANGE)
    app.put("/orders/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { customer, cartItems, pricing, status, originalItems } =
          req.body;

        // 🔁 STEP 1: Restore stock for removed items
        for (const oldItem of originalItems) {
          const updatedItem = cartItems.find(
            (i) => (i.productId || i._id).toString() === oldItem._id.toString()
          );

          // 🧨 Item removed from order → restore stock
          if (!updatedItem) {
            await productCollection.updateOne(
              { _id: new ObjectId(oldItem._id) },
              { $inc: { stock: oldItem.quantity } }
            );
          }
        }

        // 🔁 STEP 2: Sync changed & new items
        for (const item of cartItems) {
          const itemId = item.productId || item._id;
          const oldItem = originalItems.find(
            (i) => i._id.toString() === itemId.toString()
          );

          // 🆕 New item added to order → reduce stock
          if (!oldItem) {
            await productCollection.updateOne(
              { _id: new ObjectId(itemId) },
              { $inc: { stock: -item.quantity } }
            );
            continue;
          }

          // 🔄 Quantity changed → calculate delta
          const delta = item.quantity - oldItem.quantity;

          if (delta !== 0) {
            await productCollection.updateOne(
              { _id: new ObjectId(itemId) },
              { $inc: { stock: -delta } } // delta can be positive (increase order → decrease stock) or negative (decrease order → increase stock)
            );
          }
        }

        // ✅ UPDATE ORDER
        await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              customer,
              cartItems,
              pricing,
              status,
              updatedAt: new Date(),
            },
          }
        );

        res.json({
          success: true,
          message: "Order updated successfully",
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: "Order update failed",
        });
      }
    });

    // 🔹 Cancel Order + Restore Product Stock
    app.patch("/orders/cancel/:id", async (req, res) => {
      try {
        const orderId = req.params.id;

        const order = await orderCollection.findOne({
          _id: new ObjectId(orderId),
        });

        // console.log(order.cartItems)

        if (!order) {
          return res
            .status(404)
            .json({ success: false, message: "Order not found" });
        }

        if (order.status === "canceled") {
          return res
            .status(400)
            .json({ success: false, message: "Order already canceled" });
        }

        // 🔄 Restore stock for each product in the order
        for (const item of order.cartItems) {
          await productCollection.updateOne(
            { _id: new ObjectId(item.productId) },
            {
              $inc: { stock: item.quantity }, // increase stock
            }
          );
        }

        // 🟥 Update order status
        await orderCollection.updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: { status: "canceled", canceledAt: new Date() },
          }
        );

        res.json({
          success: true,
          message: "Order canceled and stock restored successfully",
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to cancel order" });
      }
    });

    // return single order
    app.patch("/orders/return/:id", async (req, res) => {
      try {
        const orderId = req.params.id;

        const order = await orderCollection.findOne({
          _id: new ObjectId(orderId),
        });

        // console.log(order.cartItems)

        if (!order) {
          return res
            .status(404)
            .json({ success: false, message: "Order not found" });
        }

        if (order.status === "returned") {
          return res
            .status(400)
            .json({ success: false, message: "Order already returned" });
        }

        // 🔄 Restore stock for each product in the order
        for (const item of order.cartItems) {
          await productCollection.updateOne(
            { _id: new ObjectId(item.productId) },
            {
              $inc: { stock: item.quantity }, // increase stock
            }
          );
        }

        // 🟥 Update order status
        await orderCollection.updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: { status: "returned", returnedAt: new Date() },
          }
        );

        res.json({
          success: true,
          message: "Order returned and stock restored successfully",
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to return order" });
      }
    });

    // 🔹 Delete order
    app.delete("/orders/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ message: "Invalid ID" });

        const result = await orderCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0)
          return res.status(404).json({ message: "Order not found" });

        res.json({ success: true, message: "Order deleted successfully" });
      } catch (error) {
        console.error("❌ Error deleting order:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete order",
        });
      }
    });

    // update status
    app.patch("/orders/confirm/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "confirmed" } }
        );

        if (result.modifiedCount === 1) {
          return res.send({ success: true, message: "Order confirmed" });
        } else {
          return res.send({ success: false, message: "Order not found" });
        }
      } catch (error) {
        console.log(error);
        res
          .status(500)
          .send({ success: false, message: "Server error", error });
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
