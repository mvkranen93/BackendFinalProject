import express from "express";
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import winston from 'winston';

// Import your Prisma client
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const app = express();


// Winston logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'your-service-name' }, // Change 'your-service-name' to an appropriate service name
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' }),
  ],
});

// Middleware to log request duration
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      message: 'Request processed',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});


// Sentry configuration

Sentry.init({
  dsn: "https://4b1989795d2f430a3758a5940c6d238d@o4506474416635904.ingest.sentry.io/4506479162294272", // Replace with your Sentry DSN
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    new ProfilingIntegration(),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

// Middleware to handle JWT authentication
function authenticateToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract the token without the "Bearer " prefix
  const tokenWithoutBearer = token.replace(/^Bearer\s/, '');

  jwt.verify(tokenWithoutBearer, '39393jfjdKER74hjrejw934', (err, user) => {
    if (err) {
      console.error('Authentication Error:', err);  // Log the error for debugging
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check if the token has expired
    const decodedToken = jwt.decode(tokenWithoutBearer, { complete: true });

    if (decodedToken && decodedToken.payload.exp) {
      const expirationTime = new Date(decodedToken.payload.exp * 1000);
      const currentTime = new Date();

      if (expirationTime <= currentTime) {
        return res.status(401).json({ error: 'Token has expired' });
      }
    }

    console.log('Decoded User:', user);  // Log the decoded user for debugging

    req.user = user;
    next();
  });
}

// Middleware to handle JSON body parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// Root route
app.get("/", function rootHandler(req, res) {
  res.end("Hello world!");


});



// --------------------------------- BEGIN LOGIN ENDPOINTS ------------------------------

// Step 0 - login endpoint
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Example: Fetch user from the database
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, '39393jfjdKER74hjrejw934', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Login Endpoint Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Protected route
app.get("/protected-route", authenticateToken, (req, res) => {
  // Access the authenticated user using req.user
  res.json({ message: "This is a protected route", user: req.user });
});

// --------------------------------- END LOGIN ENDPOINTS -------------------------------
//-----------------------------------IMPORTANT TO KNOW----------------------------------
// All endpoints defined below are using an authentication middleware using JWT


// -------------------------- ENDPOINTS WITH QUERY PARAMETERS -------------------------------

// First - /properties?location=Amsterdam&pricePerNight=88
app.get("/properties", authenticateToken, async (req, res) => {
  const { location, pricePerNight } = req.query;

  try {
    const filters = {
      ...(location && { location }),
      ...(pricePerNight && { pricePerNight: parseInt(pricePerNight) }),
    };

    // Fetch properties with applied filters
    const properties = await prisma.property.findMany({
      where: filters,
    });

    res.status(200).json(properties);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// Second - /bookings?userID=a1234567-89ab-cdef-0123-456789abcdef
app.get("/bookings", authenticateToken, async (req, res) => {
  const { userId } = req.query;

  try {
    // Define filters based on query parameters
    const filters = {
      ...(userId && { userId }),
    };

    // Fetch bookings with applied filters
    const bookings = await prisma.booking.findMany({
      where: filters,
    });

    res.status(200).json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Third & Fourth - /users endpoint with both username and email query parameters
app.get("/users", authenticateToken, async (req, res) => {
  const { username, email } = req.query;

  try {
    // Define filters based on query parameters
    const filters = {
      ...(username && { username }),
      ...(email && { email }),
    };

    // Fetch users with applied filters
    const users = await prisma.user.findMany({
      where: filters,
    });

    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Fifth - /hosts?name=Linda+Smith
app.get("/hosts", authenticateToken, async (req, res) => {
  const { name } = req.query;

  try {
    // Define filters based on query parameters
    const filters = {
      ...(name && { name }),
    };

    // Fetch hosts with applied filters
    const hosts = await prisma.host.findMany({
      where: filters,
    });

    res.status(200).json(hosts);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// -------------------------- ENDPOINTS WITH QUERY PARAMETERS -------------------------------
// --------------------------------- BEGIN USER ENDPOINTS ------------------------------

// Step 1 - Fetch all users
app.get("/users", authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
      },
    });

    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new user
app.post("/users", authenticateToken, async (req, res) => {
  const { username, password, name, email, phoneNumber, profilePicture } = req.body;

  try {
    const newUser = await prisma.user.create({
      data: { username, password, name, email, phoneNumber, profilePicture },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
      },
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single user
app.get("/users/:id", authenticateToken, async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
        reviews: true,
        bookings: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update a user
app.put("/users/:id", authenticateToken, async (req, res) => {
  const userId = req.params.id;
  const { username, password, name, email, phoneNumber, profilePicture } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { username, password, name, email, phoneNumber, profilePicture },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
      },
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Delete a user
app.delete("/users/:id", authenticateToken, async (req, res) => {
  const userId = req.params.id;

  try {
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
      },
    });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// --------------------------------- END USER ENDPOINTS ------------------------------
// --------------------------------- BEGIN BOOKING ENDPOINTS ------------------------------

// Step 1 - Fetch all bookings
app.get("/bookings", authenticateToken, async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany();
    res.status(200).json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new booking
app.post("/bookings", authenticateToken, async (req, res) => {
  const { userID, propertyId, checkinDate, checkoutDate, numberOfGuests, totalPrice, bookingStatus } = req.body;

  try {
    const newBooking = await prisma.booking.create({
      data: {
        userID,
        propertyId,
        checkinDate,
        checkoutDate,
        numberOfGuests,
        totalPrice,
        bookingStatus,
      },
    });

    res.status(201).json(newBooking);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single booking
app.get("/bookings/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.status(200).json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update a booking
app.put("/bookings/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userID, propertyId, checkinDate, checkoutDate, numberOfGuests, totalPrice, bookingStatus } = req.body;

  try {
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        userID,
        propertyId,
        checkinDate,
        checkoutDate,
        numberOfGuests,
        totalPrice,
        bookingStatus,
      },
    });

    res.status(200).json(updatedBooking);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Remove a booking
app.delete("/bookings/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.booking.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Booking deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// --------------------------------- END BOOKING ENDPOINTS ------------------------------
// --------------------------------- BEGIN PROPERTY ENDPOINTS ------------------------------


// Step 1 - Fetch all properties
app.get("/properties", authenticateToken, async (req, res) => {
  try {
    const properties = await prisma.property.findMany();
    res.status(200).json(properties);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new property
app.post("/properties", authenticateToken, async (req, res) => {
  const { hostId, title, description, location, pricePerNight, bedroomCount, bathRoomCount, maxGuestCount, rating } = req.body;

  try {
    const newProperty = await prisma.property.create({
      data: {
        hostId,
        title,
        description,
        location,
        pricePerNight,
        bedroomCount,
        bathRoomCount,
        maxGuestCount,
        rating,
      },
    });

    res.status(201).json(newProperty);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single property
app.get("/properties/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const property = await prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.status(200).json(property);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update a property
app.put("/properties/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { hostId, title, description, location, pricePerNight, bedroomCount, bathRoomCount, maxGuestCount, rating } = req.body;

  try {
    const updatedProperty = await prisma.property.update({
      where: { id },
      data: {
        hostId,
        title,
        description,
        location,
        pricePerNight,
        bedroomCount,
        bathRoomCount,
        maxGuestCount,
        rating,
      },
    });

    res.status(200).json(updatedProperty);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Remove a property
app.delete("/properties/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.property.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// --------------------------------- END PROPERTY ENDPOINTS ------------------------------
// --------------------------------- BEGIN REVIEW ENDPOINTS ------------------------------

// Step 1 - Fetch all reviews
app.get("/reviews", authenticateToken, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany();
    res.status(200).json(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new review
app.post("/reviews", authenticateToken, async (req, res) => {
  const { userId, propertyId, rating, comment } = req.body;

  try {
    const newReview = await prisma.review.create({
      data: {
        userId,
        propertyId,
        rating,
        comment,
      },
    });

    res.status(201).json(newReview);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single review
app.get("/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const review = await prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json(review);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update a review
app.put("/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId, propertyId, rating, comment } = req.body;

  try {
    const updatedReview = await prisma.review.update({
      where: { id },
      data: {
        userId,
        propertyId,
        rating,
        comment,
      },
    });

    res.status(200).json(updatedReview);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Remove a review
app.delete("/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.review.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// --------------------------------- END REVIEW ENDPOINTS ------------------------------
// --------------------------------- BEGIN HOST ENDPOINTS ------------------------------

// Step 1 - Fetch all hosts
app.get("/hosts", authenticateToken, async (req, res) => {
  try {
    const hosts = await prisma.host.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
        aboutMe: true,
        listings: false, 
      },
    });
    res.status(200).json(hosts);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new host
app.post("/hosts", authenticateToken, async (req, res) => {
  const { username, password, name, email, phoneNumber, profilePicture, aboutMe } = req.body;

  try {
    const newHost = await prisma.host.create({
      data: {
        username,
        password,
        name,
        email,
        phoneNumber,
        profilePicture,
        aboutMe,
      },
    });

    res.status(201).json(newHost);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single host
app.get("/hosts/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const host = await prisma.host.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePicture: true,
        aboutMe: true,
        listings: true,
      },
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    res.status(200).json(host);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update a host
app.put("/hosts/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, password, name, email, phoneNumber, profilePicture, aboutMe } = req.body;

  try {
    const updatedHost = await prisma.host.update({
      where: { id },
      data: {
        username,
        password,
        name,
        email,
        phoneNumber,
        profilePicture,
        aboutMe,
      },
    });

    res.status(200).json(updatedHost);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Remove a host
app.delete("/hosts/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.host.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Host deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// --------------------------------- END HOST ENDPOINTS ------------------------------
// --------------------------------- BEGIN AMENITY ENDPOINTS ------------------------------

// Step 1 - Fetch all amenities
app.get("/amenities", authenticateToken, async (req, res) => {
  try {
    const amenities = await prisma.amenity.findMany();
    res.status(200).json(amenities);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 2 - Create a new amenity
app.post("/amenities", authenticateToken, async (req, res) => {
  const { name } = req.body;

  try {
    const newAmenity = await prisma.amenity.create({
      data: {
        name,
      },
    });

    res.status(201).json(newAmenity);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 3 - Fetch a single amenity
app.get("/amenities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const amenity = await prisma.amenity.findUnique({
      where: { id },
    });

    if (!amenity) {
      return res.status(404).json({ error: 'Amenity not found' });
    }

    res.status(200).json(amenity);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 4 - Update an amenity
app.put("/amenities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const updatedAmenity = await prisma.amenity.update({
      where: { id },
      data: {
        name,
      },
    });

    res.status(200).json(updatedAmenity); 
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Step 5 - Remove an amenity
app.delete("/amenities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.amenity.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Amenity deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});


// --------------------------------- END AMENITY ENDPOINTS ------------------------------

// Test route for Sentry
app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});


// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err);
  logger.error(err.message);

  res.status(500).json({ error: "An error occurred on the server, please double-check your request!" });
});

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(3000, () => {
  console.log("Server is listening on port 3000");
});