import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds  = 10;
env.config();

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret : process.env.SESSION_SECRET,
  resave : false,
  saveUninitialized : true,
  cookie : {
    maxAge : 1000 * 60 * 60 * 24 * 12, 
  }
  })
);

app.use(passport.initialize());
app.use(passport.session());


let users = []




let currentUserId;

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get('/logout' , (req , res) => {
  req.logout(function (err) {
    if (err){
      return next(err);
    }
    res.redirect("/");
  })
});


app.get(
  "/auth/google",
  passport.authenticate("google" , {
    scope: ["profile" , "email"],
  })
);

app.get(
  "/auth/google/app",
  passport.authenticate("google" , {
    successRedirect : "/app",
    failureRedirect : "/login",
  })
);

app.post(
  "/login",
  passport.authenticate("local" , {
      successRedirect : "/app",
      failureRedirect: "/login",

  })
);




async function getCurrentUser() {
  try {
      const result = await db.query("SELECT * FROM users");
      const users = result.rows;
      const currentUser = users.find((user) => user.id == currentUserId);
      console.log("Current User:", currentUser);
      return currentUser;
  } catch (error) {
      console.error("Error fetching current user:", error);
      throw error;
  }
}

  async function userItems(currentUserId) {
    try {
        const result = await db.query("SELECT * FROM items WHERE  user_id = $1", [currentUserId]);
        const items = result.rows;
        console.log("Items:", items); 
        return items;
    } catch (error) {
        console.error("Error fetching user items:", error);
        throw error;
    }
}

app.get("/app", async (req, res) => {
  try {
      

      if (req.isAuthenticated) {
        const currentUserId = req.user.id; 
        const items = await userItems(currentUserId); 
        const currentUser = await getCurrentUser(currentUserId);
        
        res.render("index.ejs", {
            listTitle: "Today",
            listItems: items,
            currentUser: currentUser
        });
    }else {
      res.redirect('login');
    }
  } catch (error) {
      console.error("Error rendering index:", error);
      res.status(500).send("Internal Server Error");
  }
});
app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;
  
  try {
  const checkResult = await db.query("SELECT * FROM users WHERE email = $1" , [email])
  
  
  if(checkResult.rows.length > 0) {
    
    res.redirect('/');
    console.log("Email is already registered");
  }else {
    bcrypt.hash(password  , saltRounds , async (err, hash) => {
      if(err) {
        console.log('Error hashing password : ' , err);
      }else {
        const result = await db.query("INSERT INTO users (email , password ) VALUES ($1 , $2)" , [email , hash]);
        
        const user = result.rows[0];
        req.login(user , (err) => {
            console.log(err);
            res.redirect('/app');
        });
      }
    }); 
  }
    }catch(err){
      console.log(err);
    }
  
  });

  app.post("/login" , 
  passport.authenticate("local", {
      successRedirect : '/app',
      failureRedirect :'/login',
  }));
  

passport.use("local",
  new Strategy(async function verify(username , password , cb){
  console.log(username);
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1" , [username]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedPassword = user.password;
  
      bcrypt.compare(password  ,storedPassword , (err , result) => {
        if(err){
            return cb(err);
        }else {
          if(result) {  
            return cb(null, user);
          } else {
            return cb(null , false);
          }
        }
      });
    }else {
      return cb("User not found");

  }
    }catch(err) {
      return cb(err);
    }
  }));

  passport.serializeUser((user , cb) => {
      cb(null , user);
  });

passport.deserializeUser((user , cb) => {
    cb(null , user);
});


app.post("/add",  async (req, res) => {
  const item = req.body.newItem;
   currentUserId = req.user.id;
  

  try {
    await db.query("INSERT INTO items (title , user_id) VALUES ($1 , $2) " , [item , currentUserId]);
    res.redirect('/app');


  }catch (err) {
    console.log(err);
  }
});

app.post("/edit", async (req, res) => {

const item = req.body.updatedItemTitle;
const id = req.body.updatedItemId

try {

  await db.query("UPDATE items SET title  = ($1) WHERE id = ($2) " , [item , id]);
  res.redirect('/app')
}catch (err) {
  console.log(err);

}

});


app.post("/delete", async (req, res) => {
  const id = req.body.deleteItemId;

  try {
  
    const itemCountBeforeDeletion = await db.query("SELECT COUNT(*) FROM items");

    await db.query("DELETE FROM items WHERE id = $1", [id]);

    
    const itemCountAfterDeletion = await db.query("SELECT COUNT(*) FROM items");

   
    if (itemCountAfterDeletion.rows[0].count === 0) {
      res.redirect('/app');
    } else {
      res.redirect('/app'); 
    }
  } catch (err) {
    console.log(err);
  }
});


passport.use("google", new GoogleStrategy({
  clientID :process.env.GOOGLE_CLIENT_ID,
  clientSecret : process.env.GOOGLE_CLIENT_SECRET,
  callbackURL : "http://localhost:3000/auth/google/app",
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
  
}, async(acessToken , refreshToken , profile ,  cb) => {
  console.log(profile);
  try{
    console.log(profile);
    const result = await db.query("SELECT * FROM users WHERE email= $1 ",[
      profile.email
    ]);
    if(result.rows.length === 0){
      const newUser = await db.query(
        "INSERT INTO users (email , password) VALUES ($1, $2) ",
         [profile.email, "google"]
      );
      return cb(null , newUser.rows[0]);
    }else {
      return cb(null , result.rows[0]);

    }
  }catch(err){
    return cb(err);

  }
}
  )
    )


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
