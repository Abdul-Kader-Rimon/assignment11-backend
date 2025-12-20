const express = require("express");
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRATE);
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json())




const admin = require("firebase-admin");
const { url } = require("inspector");
const { error } = require("console");
const decoded = Buffer.from(process.env.FB_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});



const verifyFBToken = async (req , res , next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({message : "unauthorize access"})
  }

  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    console.log("decoded info", decoded)
    req.decoded_email = decoded.email;
    next()
  }
  catch (error) {
   return res.status(401).send({ message: "unauthorize access" });
  }
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gfwnnwz.mongodb.net/?appName=Cluster0`;

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
    await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db("assignment11");
    const userCollections = database.collection("user");
    const requestsCollections = database.collection("request");
    const paymentsCollections = database.collection("payments");

    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = "Donor";
      userInfo.status = "active";

      const result = await userCollections.insertOne(userInfo);

      res.send(result);
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const { status } = req.query;

      let query = {};
      if (status) {
        query.status = status;
      }

      const result = await userCollections.find(query).toArray();
      res.status(200).send(result);
    });

    app.get("/user", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).send({ message: "Email required" });

      const user = await userCollections.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      
      res.status(200).send(user)
    })

    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;

      const quary = { email: email };
      const result = await userCollections.findOne(quary);
      console.log(result);
      res.send(result);
    });

    app.patch("/update/user/status", verifyFBToken, async (req, res) => {
      const { email, status } = req.query;
      const quary = { email: email };

      const updateStatus = {
        $set: {
          status: status,
        },
      };

      const result = await userCollections.updateOne(quary, updateStatus);
      res.send(result);
    });

    //volunteer
    app.patch(
      "/users/make-volunteer/:email",
      verifyFBToken,
      async (req, res) => {
        const email = req.params.email;
        const result = await userCollections.updateOne(
          { email },
          { $set: { role: "volunteer" } }
        );

        res.send(result);
      }
    );
    app.patch("/users/make-admin/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const result = await userCollections.updateOne(
        { email },
        { $set: { role: "admin" } }
      );

      res.send(result);
    });
    app.patch("/users/make-donor/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const result = await userCollections.updateOne(
        { email },
        { $set: { role: "Donor" } }
      );

      res.send(result);
    });

    //request

    app.post("/requests", verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await requestsCollections.insertOne(data);

      res.send(result);
    });

    app.get("/my-request", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const size = Number(req.query.size);
      const page = Number(req.query.page);
      const query = { requester_email: email };

      const result = await requestsCollections
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();

      const totalRequest = await requestsCollections.countDocuments(query);

      res.send({ request: result, totalRequest });
    });

    app.get("/search-requests", async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      const query = {};

      if (!query) {
        return;
      }
      if (bloodGroup) {
        const fixed = bloodGroup.replace(/ /g, "+").trim();
        query.blood_group = fixed;
      }
      if (district) {
        query.recipient_district = district;
      }
      if (upazila) {
        query.recipient_upazila = upazila;
      }
      console.log(query);

      const result = await requestsCollections.find(query).toArray();

      res.send(result);
    });

    app.get("/admin/dashboard-stats", verifyFBToken, async (req, res) => {
      try {
        const totalUsers = await userCollections.countDocuments();
        const totalRequests = await requestsCollections.countDocuments();

        const paymentResult = await paymentsCollections
          .aggregate([
            {
              $group: {
                _id: null,
                totalFunding: { $sum: "$amount" },
              },
            },
          ])
          .toArray();

        res.send({
          totalUsers,
          totalRequests,
          totalFunding: paymentResult[0]?.totalFunding || 0,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to load admin stats" });
      }
    });

    app.get("/payments/total", verifyFBToken, async (req, res) => {
      const result = await paymentsCollections
        .aggregate([
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalPayments: { $sum: 1 },
            },
          },
        ])
        .toArray();

      res.send(result[0] || { totalAmount: 0, totalPayments: 0 });
    });

    //payments

    app.post("/create-payment-checkout", async (req, res) => {
      const information = req.body;
      const amount = parseInt(information.donateAmount) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: "please Donate",
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          donarName: information?.donarName,
        },
        customer_email: information?.donarEmail,
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.post("/success-payment", async (req, res) => {
      const { session_id } = req.query;
      const session = await stripe.checkout.sessions.retrieve(session_id);
      console.log(session);

      const transactionId = session.payment_intent;
      const isPaymentExist = await paymentsCollections.findOne({
        transactionId,
      });

      if (isPaymentExist) {
        return res.status(400).send("Already Exist");
      }

      if (session.payment_status == "paid") {
        const paymentInfo = {
          amount: session.amount_total / 100,
          currency: session.currency,
          donarEmail: session.customer_email,
          transactionId,
          payment_status: session.payment_status,
          paidAt: new Date(),
        };
        const result = await paymentsCollections.insertOne(paymentInfo);
        return res.send(result);
      }
    });

    app.patch("/update-profile/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const updateData = req.body;

      try {
        const result = await userCollections.updateOne(
          { email },
          { $set: updateData }
        );
        if (result.acknowledged) {
          res.send({ success: true, message: "Profile updated" });
        } else {
          res
            .status(400)
            .send({ success: false, message: "No changes Were mode" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Failed to update profile" });
      }
    });

    app.get("/donation-requests", verifyFBToken, async (req, res) => {
      try {
        const emailFromToken = req.decoded_email;
        const emailFromQuery = req.query.email;
        const limit = parseInt(req.query.limit) || 3;

        if (emailFromToken !== emailFromQuery) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const requests = await requestsCollections
          .find({ requester_email: emailFromQuery })
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        res.send(requests);
      } catch (error) {
        res.status(500).send({ message: "Failed to load donation requests" });
      }
    });

    app.get("/donation-requests/all", verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 10;
        const status = req.query.status;

        const query = { requester_email: email };
        if (status) query.status = status;

        const requests = await requestsCollections
          .find(query)
          .sort({ createdAt: -1 })
          .skip(page * size)
          .limit(size)
          .toArray();

        const total = await requestsCollections.countDocuments(query);

        res.send({ requests, total });
      } catch (error) {
        res.status(500).send({ message: "Failed to  fetch donation requests" });
      }
    });

    app.get("/donation-requests/:id", verifyFBToken, async (req, res) => {
      try {
        const request = await requestsCollections.findOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(request);
      } catch (error) {
        res.status(500).send({ message: "Failed to  fetch donation request" });
      }
    });

    app.post("/donation-requests", verifyFBToken, async (req, res) => {
      try {
        const user = await userCollections.findOne({
          email: req.decoded_email,
        });

        if (user.status !== "active") {
          return res
            .status(403)
            .send({ message: "Blocked users cannot create requests" });
        }

        const data = req.body;

        data.requester_email = req.decoded_email;
        data.requester_name = user.name || user.displayName;
        data.status = "pending";
        data.createdAt = new Date();

        const result = await requestsCollections.insertOne(data);

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to  create donation request" });
      }
    });

    app.patch("/donation-requests/:id", verifyFBToken, async (req, res) => {
      try {
        const updateData = req.body;
        const result = await requestsCollections.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updateData }
        );

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to   update donation request" });
      }
    });

    app.patch(
      "/donation-requests/status/:id",
      verifyFBToken,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          const result = await requestsCollections.updateOne(
            { _id: new ObjectId(id) },
            { $set: { donation_status: status } }
          );

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: "Status updated successfully",
            });
          } else {
            res
              .status(400)
              .send({ success: false, message: "No changes made" });
          }
        } catch (error) {
          res.status(500).send({ message: "Failed to update status" });
        }
      }
    );

    app.delete("/donation-requests/:id", verifyFBToken, async (req, res) => {
      try {
        const result = await requestsCollections.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete donation request" });
      }
    });

 
    app.get("/admin/all-donation-requests", verifyFBToken, async (req, res) => {
      try {

         const { status } = req.query;  

        let query = {};
        
           if (status) {
             query = {
               $or: [{ donation_status: status }, { status: status }],
             };
           }



        const requests = await requestsCollections
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        
        res.send(requests);


      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to load all donation requests" });
      }
    });
    






    app.patch("/donation-requests/status/:id", verifyFBToken,async (req, res) => {
      try {
        
        const { id } = req.params;
        const { status } = req.body;


        const result = await requestsCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { donation_status: status } }
        );
            
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Status updated successfully" });
        } else {
          res.status(400).send({ success: false, message: "No changes made" });
        }

         
        } catch (error) {
          res
            .status(500)
            .send({ message: "Failed to load all donation requests" });
        }
      }
    );

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("server in running fine")
})

app.listen(port,()=> {
    console.log(`server is running on ${port}`);
    
})

