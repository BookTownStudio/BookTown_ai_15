import { wrapRestExport } from "../contracts/wrapRestExport";
import { api as apiRaw } from "../api";
import { sitemap as sitemapRaw } from "../ssr/sitemap";
import { sitemapPublications as sitemapPublicationsRaw } from "../ssr/sitemapPublications";
import { ssrPublicPage as ssrPublicPageRaw } from "../ssr/ssrPublicPage";

export const sitemap = sitemapRaw;
export const sitemapPublications = sitemapPublicationsRaw;
export const ssrPublicPage = ssrPublicPageRaw;
export const api = wrapRestExport(apiRaw);
