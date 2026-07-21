import Image from "next/image";
import Login from "./log_in/page"
import Gamerooms from "./gamerooms/page"

export default function landingPage() {
  
  // if no account logged in
  return (Login());
  // else
    // return (Gamerooms());
}
