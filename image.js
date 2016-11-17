'use strict';

// dependencies
const AWS = require('aws-sdk');
const Jimp = require('jimp');
const Q = require('kew');

// get reference to S3 client
const s3 = new AWS.S3();

module.exports.blurImage = (event, context, callback) => {
  console.log('starting function');

  const sourceBucket = event.Records[0].s3.bucket.name;
  // Object key may have spaces or unicode non-ASCII characters.
  const sourceKey =
    decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const destinationBucket = `${sourceBucket}-blurred`;
  const destinationKey = `blurred-${sourceKey}`;

  console.log(destinationBucket);
  console.log(destinationKey);

  // Sanity check: validate that source and destination are different buckets.
  if (sourceBucket === destinationBucket) {
    callback('Source and destination buckets are the same.');
    return;
  }

  // Infer the image type.
  const typeMatch = sourceKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    callback('Could not determine the image type.');
    return;
  }
  const imageType = typeMatch[1];
  if (imageType !== 'jpg' && imageType !== 'png') {
    callback(`Unsupported image type: ${imageType}`);
    return;
  }

  function getImageFromS3() {
    console.log('getting image from S3');
    const defer = Q.defer();
    s3.getObject({
      Bucket: sourceBucket,
      Key: sourceKey
    },
    defer.makeNodeResolver());
    return defer.promise;
  }

  function readImage(data) {
    console.log('reading image');
    const defer = Q.defer();
    Jimp.read(data.Body, defer.makeNodeResolver());
    return defer.promise;
  }

  function blurImage(image) {
    console.log('blurring image');
    const defer = Q.defer();
    const blurLevel = 30;
    const quality = 70;
    image
      .blur(blurLevel)
      .quality(quality)
      .getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
        // Couldn't get defer.makeNodeResolver to work here
        defer.resolve(buffer);
      });
    return defer.promise;
  }

  function writeImageToS3(data) {
    console.log('writing blurred image to s3');
    const defer = Q.defer();
    s3.putObject({
      Bucket: destinationBucket,
      Key: destinationKey,
      ACL: 'public-read',
      Body: data,
      ContentType: 'JPG'
    },
    defer.makeNodeResolver());
    return defer.promise;
  }

  function response(data, callback) {
    console.log(data);
    console.log('function finished');
    callback(null, data);
  }

  getImageFromS3()
    .then(data => readImage(data))
    .then(image => blurImage(image))
    .then(data => writeImageToS3(data))
    .then(data => response(data, callback))
    .fail(err => response(err, callback));

};
