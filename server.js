require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const midtransClient = require("midtrans-client");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
ffmpeg.setFfmpegPath(ffmpegPath);

// buat folder upload & output otomatis
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("outputs")) fs.mkdirSync("outputs");

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected ✅"))
.catch(err=>console.log(err));

/* ================= USER SCHEMA ================= */
const userSchema = new mongoose.Schema({
  email:{type:String,unique:true},
  password:String,
  role:{type:String,default:"free"},
  dailyLimit:{type:Number,default:1},
  usedToday:{type:Number,default:0},
  lastReset:{type:Date,default:Date.now},
  subscriptionExpire:Date,
  referralCode:String,
  referredBy:String,
  referralBonus:{type:Number,default:0},
  createdAt:{type:Date,default:Date.now}
});
const User = mongoose.model("User",userSchema);

/* ================= AUTH MIDDLEWARE ================= */
const auth = async(req,res,next)=>{
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({message:"Unauthorized"});
  try{
    const decoded = jwt.verify(token,process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  }catch{ res.status(401).json({message:"Invalid token"}); }
};

/* ================= REGISTER ================= */
app.post("/register", async(req,res)=>{
  const {email,password,referral} = req.body;
  const hashed = await bcrypt.hash(password,10);
  const code = Math.random().toString(36).substring(2,8);
  const user = new User({
    email,
    password:hashed,
    referralCode:code,
    referredBy:referral || null
  });
  await user.save();
  res.json({message:"Registered ✅"});
});

/* ================= LOGIN ================= */
app.post("/login", async(req,res)=>{
  const {email,password} = req.body;
  const user = await User.findOne({email});
  if(!user) return res.status(400).json({message:"Not found"});
  const match = await bcrypt.compare(password,user.password);
  if(!match) return res.status(400).json({message:"Wrong password"});
  const token = jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:"7d"});
  res.json({token});
});

/* ================= RESET LIMIT ================= */
const resetLimit = async(user)=>{
  const diff = (new Date()-user.lastReset)/(1000*60*60);
  if(diff>=24){
    user.usedToday=0;
    user.lastReset=new Date();
    await user.save();
  }
};

/* ================= VIDEO PROCESS ================= */
const upload = multer({dest:"uploads/"});
app.post("/process", auth, upload.single("video"), async(req,res)=>{
  const user=req.user;
  if(user.subscriptionExpire && new Date()>user.subscriptionExpire){
    user.role="free";
    await user.save();
  }
  await resetLimit(user);
  if(user.role==="free" && user.usedToday>=1){
    return res.status(403).json({message:"Limit 1 video per 24 jam"});
  }
  const input=req.file.path;
  const output="outputs/out-"+Date.now()+".mp4";
  ffmpeg(input)
    .videoFilters("hqdn3d=1.5:1.5:6:6,scale=1920:1080,unsharp=5:5:1.1")
    .videoCodec("libx264")
    .outputOptions(["-b:v 14M","-preset veryfast"])
    .save(output)
    .on("end", async()=>{
      user.usedToday+=1;
      await user.save();
      res.download(output);
    })
    .on("error", (err)=>{console.log(err); res.status(500).json({message:"Processing error"}); });
});

/* ================= MIDTRANS PAYMENT ================= */
let snap = new midtransClient.Snap({
  isProduction:false,
  serverKey:process.env.MIDTRANS_SERVER_KEY
});

app.post("/create-payment", auth, async(req,res)=>{
  const parameter={
    transaction_details:{
      order_id:"ORDER-"+Date.now(),
      gross_amount:49000
    }
  };
  const transaction = await snap.createTransaction(parameter);
  res.json({token:transaction.token});
});

/* ================= WITHDRAW REFERRAL ================= */
app.post("/withdraw-referral", auth, async(req,res)=>{
  const user=req.user;
  if(user.referralBonus<=0) return res.json({message:"Tidak ada saldo untuk withdraw"});
  const amount=user.referralBonus;
  user.referralBonus=0;
  await user.save();
  res.json({message:"Berhasil withdraw Rp "+amount});
});

/* ================= GET USER INFO ================= */
app.get("/me", auth, async(req,res)=>{
  const user=req.user;
  res.json({referralBonus:user.referralBonus,role:user.role,email:user.email});
});

/* ================= ADMIN STATS ================= */
app.get("/admin/stats", async(req,res)=>{
  const totalUsers = await User.countDocuments();
  const totalPro = await User.countDocuments({role:"pro"});
  const totalRevenue = totalPro*49000;
  res.json({totalUsers,totalPro,totalRevenue});
});

app.listen(5000, ()=>console.log("Backend running ✅"));      user.usedToday+=1;
      await user.save();
      res.download(output);
    })
    .on("error", (err)=>{console.log(err); res.status(500).json({message:"Processing error"}); });
});

/* ================= MIDTRANS PAYMENT ================= */
let snap = new midtransClient.Snap({
  isProduction:false,
  serverKey:process.env.MIDTRANS_SERVER_KEY
});

app.post("/create-payment", auth, async(req,res)=>{
  const parameter={
    transaction_details:{
      order_id:"ORDER-"+Date.now(),
      gross_amount:49000
    }
  };
  const transaction = await snap.createTransaction(parameter);
  res.json({token:transaction.token});
});

/* ================= WEBHOOK ================= */
app.post("/webhook", async(req,res)=>{
  const {email} = req.body;
  const user = await User.findOne({email});
  if(!user) return res.sendStatus(404);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth()+1);
  user.role="pro";
  user.subscriptionExpire=nextMonth;
  if(user.referredBy){
    const ref = await User.findOne({referralCode:user.referredBy});
    if(ref){
      ref.referralBonus+=10000;
      await ref.save();
    }
  }
  await user.save();
  res.sendStatus(200);
});

/* ================= ADMIN STATS ================= */
app.get("/admin/stats", async(req,res)=>{
  const totalUsers = await User.countDocuments();
  const totalPro = await User.countDocuments({role:"pro"});
  const totalRevenue = totalPro*49000;
  res.json({totalUsers,totalPro,totalRevenue});
});

app.listen(5000, ()=>console.log("Backend running ✅"));
