import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://scanner.fairway3games.com/sitemap.xml",
    host: "https://scanner.fairway3games.com",
  };
}
