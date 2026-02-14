const CONTEXTS = [
  {
    id: "ar_assistant",
    title: "AR furniture visualization app",
    shortLabel: "the AR furniture app",
    description:
      "Imagine using an app like IKEA Place or Amazon's AR View that lets you visualize how furniture would look in your room by scanning your space with your phone camera.",
  },
  {
    id: "furniture_scanner",
    title: "Home improvement & shopping app",
    shortLabel: "the home improvement app",
    description:
      "Imagine using an app like IKEA, OBI, Home Depot, or Houzz that scans your room photos to suggest products, measure spaces, or provide renovation ideas.",
  },
  {
    id: "smart_camera",
    title: "Smart home security camera",
    shortLabel: "the smart home camera",
    description:
      "Imagine this image was captured by a smart home security camera like Ring, Nest, or Arlo that records inside your home and uses AI to detect people or activity.",
  },
  {
    id: "social_media_ai",
    title: "Social media & photo storage",
    shortLabel: "social media",
    description:
      "Imagine uploading this to Instagram, Facebook, or Google Photos where AI automatically analyzes it to tag people, identify objects, suggest memories, and organize your content.",
  },
];

const CONTEXT_IDS = CONTEXTS.map((context) => context.id);
const CONTEXT_ID_SET = new Set(CONTEXT_IDS);

module.exports = {
  CONTEXTS,
  CONTEXT_IDS,
  CONTEXT_ID_SET,
};
