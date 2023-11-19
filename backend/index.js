const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const users = require("./users/users");
const books = require("./books/books");
const stripe = require("./stripe/stripe");
const cart = require("./cart/cart");
const cookieParser = require("cookie-parser");
const PORT = 3001;
const app = express();

let httpsOptions = {};

try {
  httpsOptions = {
    key: fs.readFileSync("./key.pem"),
    cert: fs.readFileSync("./cert.pem"),
  };
} catch (err) {
  console.log(
    "Missing SSL keys. You will not be able to run this app in production mode."
  );
}

const corsOptions = {
  origin: "https://ec2-54-175-236-193.compute-1.amazonaws.com",
  credentials: true,
};

app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

app.post("/api/users/create", async (req, res) => {
  try {
    const response = await users.createUser(
      req.body["email"],
      req.body["pass"]
    );

    if (response) {
      res.status(200).json({ message: "Registration successful!" });
      return;
    } else {
      res.status(400).json({ message: "User Registration Failed." });
      return;
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/api/authentication", async (req, res) => {
  try {
    /*
            {
                email: 'example@example.com',
                pass: 'password1234'
            }
        */
    const { email, pass } = req.body;
    const response = await users.signInUser(email, pass);
    if (!response) {
      res.status(400).json({
        message: "Provided Login credentials are incorrect or don't exist.",
      });
    } else {
      res.cookie("jwt", response.refreshToken, {
        httpOnly: true,
        sameSite: "None",
        maxAge: 24 * 60 * 60 * 1000,
        secure: true,
      });
      res.status(200).json({
        message: "Successfully signed in the user!",
        role: response.role,
        accessToken: response.accessToken,
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/api/logout", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) {
    console.log("No Cookies Provided");
    return res.status(401).json("No Token Provided");
  }

  const refreshToken = cookies.jwt;

  try {
    const logoutResponse = await users.signOutUser(refreshToken);
    res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
    return res
      .status(200)
      .json({ message: "Successfully signed out the User!" });
  } catch (err) {
    console.log(err);
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const response = await books.createBook(req.body);
    if (!response) {
      res.status(400).json({ message: "Failed to add book to the database." });
    } else {
      console.log(response);
      const stripeResponse = await stripe.testCreateProduct(
        req.body,
        response.insertedId.toString()
      );
      if (!stripeResponse) {
        return res
          .status(400)
          .json({ message: "Failed to add product to stripe" });
      } else {
        const updateResponse = await books.updateBook(
          response.insertedId,
          stripeResponse.productId
        );
        if (updateResponse) {
          return res.status(200).json({
            message: "Successfully added the book to the database!",
            productId: stripeResponse.productId,
          });
        } else {
          return res
            .status(400)
            .json({ message: "Failed to add stripe price ID to database" });
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/api/token/refresh", async (req, res) => {
  console.log("User is requesting a new access token...");
  const cookies = req.cookies;
  if (!cookies.jwt)
    return res.status(401).json({ message: "No refresh token provided." });

  const refreshToken = cookies.jwt;

  const tokenResponse = await users.handleRefreshToken(refreshToken);
  if (tokenResponse) {
    console.log("Sending access token back to front-end!");

    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://ec2-54-175-236-193.compute-1.amazonaws.com"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    return res.status(200).json({
      role: tokenResponse.role,
      accessToken: tokenResponse.accessToken,
    });
  }
});

app.get("/api/books", async (req, res) => {
  console.log("Hit books endpoint for list of books!");
  try {
    const response = await books.getBooks();
    if (!response) {
      res.status(400).json({ message: "No books found!" });
    } else {
      if (process.env.NODE_ENV === "production") {
        res.setHeader(
          "Access-Control-Allow-Origin",
          "https://ec2-54-175-236-193.compute-1.amazonaws.com"
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      res
        .status(200)
        .json({ message: "Successfully retrieved books!", data: response });
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/api/books/:category", async (req, res) => {
  console.log("Getting specific list of books");
  let category = req.params.category;
  if (category.toLowerCase() === "best-sellers") category = "best seller";
  try {
    const response = await books.getBooks({ category: category });
    if (!response) {
      return res
        .status(400)
        .json({ message: "No books in that category found!" });
    } else {
      if (process.env.NODE_ENV === "production") {
        res.setHeader(
          "Access-Control-Allow-Origin",
          "https://ec2-54-175-236-193.compute-1.amazonaws.com"
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      res
        .status(200)
        .json({ message: "Successfully retrieved books!", data: response });
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/api/cart", async (req, res) => {
  console.log("Getting Cart items...");
  const response = await cart.getCartItems();
  if (response) {
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://ec2-54-175-236-193.compute-1.amazonaws.com"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    return res.status(200).json(response);
  } else {
    return res.status(400).json({ message: "Cart is empty" });
  }
});

app.post("/api/cart", async (req, res) => {
  console.log("Adding a new item to the cart...");
  console.log(req.body["item"]);
  try {
    const response = await cart.addItemToCart(req.body["item"]);
    if (!response) {
      return res.status(400).json({ message: "Failed to add item to cart" });
    } else {
      res
        .status(200)
        .json({ message: "Successfully added a new item to the cart!" });
    }
  } catch (err) {
    console.log(err);
  }
});

app.put("/api/cart/:id", async (req, res) => {
  console.log("Attempting to update cart database...");
  console.log(req.body);
  const id = req.params.id;
  if (!req.body["set"]) {
    console.log("Not a set action, increment quantity by 1...");
    const updateResponse = await cart.incrementQuantity(id);
    if (updateResponse) {
      return res
        .status(200)
        .json({ message: "Successfully updated the quanity of cart item!" });
    } else {
      return res
        .status(400)
        .json({ message: "Failed to update cart quantity" });
    }
  } else {
    console.log(
      "This is a set action, set the quantity to the provided number..."
    );
    const setUpdateResponse = await cart.updateQuantity(
      id,
      req.body["quantity"]
    );
    if (setUpdateResponse) {
      return res
        .status(200)
        .json({ message: "Successfully set item quantity to specified value" });
    } else {
      return res
        .status(400)
        .json({ message: "Failed to update cart quantity" });
    }
  }
});

app.delete("/api/cart", async (req, res) => {
  console.log("Clearing the cart...");
  try {
    const response = await cart.clearCart();
    if (response) {
      return res
        .status(200)
        .json({ message: "Successfully cleared the cart!" });
    } else {
      return res.status(400).json({ message: "Failed to clear the cart" });
    }
  } catch (err) {
    console.log(err);
  }
});

app.delete("/api/cart/:id", async (req, res) => {
  console.log("Attempting to remove an item from the cart...");
  const id = req.params.id;
  try {
    const response = await cart.deleteItem(id);
    if (response) {
      return res
        .status(200)
        .json({ message: "Successfully removed the item from the cart!" });
    } else {
      return res
        .status(400)
        .json({ message: "Failed to remove item from cart" });
    }
  } catch (err) {
    console.log(err);
  }
});

/*
    This is how the backend gets started. The PORT variable defines what port it will listen for connections on
    Due to Cross Origin Resource Sharing (CORS) rules in modern web browsers you technically shouldn't make
    any requests to a different location than what your website is hosted on. BUT you may say isn't the frontend
    on PORT 3000? And the answer is Yes! However, if you look at the package.json file you will see a 'proxy' value
    set to localhost:3001. This means any requests on the frontend ARE sent on the same port (3000) BUT they are
    proxied to go to 3001 tricking the browser and not triggering CORS protections. This same method can be applied
    on your internal network if for example your company has the front-end and backend hosted on two different servers

    In more extreme cases you can even do this over the public internet as well though that's usually frowned upon
    without using a company VPN between the devices.
*/

if (process.env.NODE_ENV === "development") {
  app.listen(PORT, () => {
    console.log("Launched the backend in development mode!");
    console.log(`Server listening on ${PORT}...`);
  });
} else if (process.env.NODE_ENV === "production") {
  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`HTTPS Server listening on port ${PORT}...`);
  });
} else {
  console.log(
    "No evironment specified. Please run the backend with either the development or production environment commands."
  );
}
