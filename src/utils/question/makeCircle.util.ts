import sharp from "sharp";

const makeCircle = async (inputBuffer: any) => {
  const size = 200;

  const circleSvg = Buffer.from(`
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>
  `);

  const resizedImage = await sharp(inputBuffer).resize(size, size).toBuffer();

  const roundedImage = await sharp(resizedImage)
    .composite([{ input: circleSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  return roundedImage;
};

export default makeCircle;
