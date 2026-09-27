import express from 'express';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Received request: GET /`);
  res.json({
    message: "Hello from Node Express server!",
    success: true,
    timestamp: new Date().toISOString()
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running at http://192.168.0.150:${port} (listening on 0.0.0.0)`);
});
