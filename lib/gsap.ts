import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  if (!CustomEase.get("reveal")) {
    CustomEase.create("reveal", "0.16,1,0.3,1");
  }
}

export { gsap, ScrollTrigger };
