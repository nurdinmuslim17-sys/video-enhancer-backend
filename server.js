const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("video"), (req, res) => {
  const inputPath = req.file.path;
  const outputPath = "output_" + Date.now() + ".mp4";

  ffmpeg(inputPath)
    .setFfmpegPath(ffmpegPath)
    .videoCodec("libx264")
    .size("1920x1080")
    .outputOptions([
      "-b:v 16M",
      "-preset slow",
      "-profile:v high",
      "-level 4.2",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-r 30"
    ])
    .save(outputPath)
    .on("end", () => {
      res.download(outputPath, () => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    })
    .on("error", (err) => {
      console.log(err);
      res.status(500).send("Processing error");
    });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
