import "dotenv/config";
import app from "./app";

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`fps-manager-ration-backend listening on port ${port}`);
});
