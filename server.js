const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

// Pastikan folder uploads ada
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });

// Route test
app.get("/", (req, res) => {
  res.send("Video Enhancer Backend Running 🚀");
});

// Route upload + enhance
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const inputPath = req.file.path;
  const outputPath = path.join(
    __dirname,
    "output_" + Date.now() + ".mp4"
  );

  ffmpeg(inputPath)
    .setFfmpegPath(ffmpegPath)
    .videoCodec("libx264")
    .size("1920x1080") // Upscale 720p → 1080p
    .outputOptions([
      "-b:v 14M",          // Auto bitrate HD (12–16 Mbps)
      "-preset slow",
      "-profile:v high",
      "-level 4.2",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-r 30"
    ])
    .on("end", () => {
      res.download(outputPath, () => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg Error:", err);
      res.status(500).send("Processing error");
    })
    .save(outputPath);
});

// WAJIB untuk Railway
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
