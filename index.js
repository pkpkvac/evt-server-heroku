const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(cors());
app.use(express.json());

let isRecharging = false;

const resetVehicle = async () => {
  const { error } = await supabase
    .from("vehicle_data")
    .update({
      battery_percent: 40,
      motor_speed: 0,
      motor_rpm: 0,
      power: 0,
      parking_brake: true,
      battery_temp: 25,
      motor_status: false,
      battery_low: false,
      check_engine: false,
    })
    .eq("id", 1);

  if (error) {
    console.error("Error resetting vehicle:", error);
  } else {
    console.log("Vehicle reset successfully");
  }
};

const updateBatteryPercentage = async () => {
  const { data, error } = await supabase
    .from("vehicle_data")
    .select("motor_speed, battery_percent, battery_temp")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Error fetching vehicle data:", error);
    return;
  }

  console.log("motor_speed", data.motor_speed);

  const { motor_speed, battery_percent, battery_temp } = data;

  if (isRecharging && motor_speed === 0) {
    await supabase
      .from("vehicle_data")
      .update({
        battery_percent: Math.min(battery_percent + 2, 100),
        battery_temp: Math.max(battery_temp - 1, 25),
        parking_brake: true,
        motor_speed: 0,
        motor_rpm: 0,
        power: 0,
        motor_status: false,
      })
      .eq("id", 1);
  } else if (motor_speed === 0) {
    await supabase
      .from("vehicle_data")
      .update({
        battery_temp: Math.max(battery_temp - 1, 25),
        battery_percent: battery_percent,
        power: 0,
        motor_rpm: 0,
        motor_status: false,
        parking_brake: true,
      })
      .eq("id", 1);
  } else {
    let decrement = 0;
    let tempIncrease = 0;
    let power = 0;
    let rpm = 0;
    let motorStatus = false;

    switch (motor_speed) {
      case 1:
        decrement = 1;
        tempIncrease = 1;
        power = 200;
        rpm = 200;
        break;
      case 2:
        decrement = 2;
        tempIncrease = 2;
        power = 400;
        rpm = 400;
        break;
      case 3:
        decrement = 3;
        tempIncrease = 3;
        power = 600;
        rpm = 600;
        motorStatus = true;
        break;
      case 4:
        decrement = 5;
        tempIncrease = 5;
        power = 800;
        rpm = 800;
        motorStatus = true;
        break;
      default:
        decrement = 0;
        tempIncrease = 0;
        power = 0;
        rpm = 0;
        motorStatus = false;
        break;
    }

    await supabase
      .from("vehicle_data")
      .update({
        battery_percent: Math.max(battery_percent - decrement, 0),
        battery_temp: battery_temp + tempIncrease,
        power: power,
        motor_rpm: rpm,
        motor_status: motorStatus,
        parking_brake: motor_speed === 0,
        battery_low: battery_percent - decrement <= 30,
        check_engine: battery_temp + tempIncrease >= 40,
      })
      .eq("id", 1);
  }
};

cron.schedule("*/5 * * * * *", updateBatteryPercentage);

app.post("/api/update-motor-speed", async (req, res) => {
  const { speed } = req.body;
  const { status } = await supabase
    .from("vehicle_data")
    .update({
      motor_speed: speed,
    })
    .eq("id", 1);

  console.log("updating speed", speed);

  if (status !== 204) {
    console.error("Error updating motor speed:", error);
    res.status(500).json({ message: "Error updating motor speed" });
  } else {
    isRecharging = false;
    res.status(200).json({ message: "Motor speed updated", speed });
  }
});

app.post("/api/reset", async (req, res) => {
  await resetVehicle();
  isRecharging = false;
  res.status(200).json({ message: "Vehicle reset" });
});

app.post("/api/recharge", async (req, res) => {
  isRecharging = true;
  res.status(200).json({ message: "Vehicle recharging" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
