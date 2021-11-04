"use strict";(self.webpackChunk=self.webpackChunk||[]).push([[8261],{3905:(e,t,n)=>{n.d(t,{Zo:()=>c,kt:()=>m});var r=n(7294);function a(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function i(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,r)}return n}function o(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?i(Object(n),!0).forEach((function(t){a(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):i(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function s(e,t){if(null==e)return{};var n,r,a=function(e,t){if(null==e)return{};var n,r,a={},i=Object.keys(e);for(r=0;r<i.length;r++)n=i[r],t.indexOf(n)>=0||(a[n]=e[n]);return a}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(r=0;r<i.length;r++)n=i[r],t.indexOf(n)>=0||Object.prototype.propertyIsEnumerable.call(e,n)&&(a[n]=e[n])}return a}var p=r.createContext({}),l=function(e){var t=r.useContext(p),n=t;return e&&(n="function"==typeof e?e(t):o(o({},t),e)),n},c=function(e){var t=l(e.components);return r.createElement(p.Provider,{value:t},e.children)},u={inlineCode:"code",wrapper:function(e){var t=e.children;return r.createElement(r.Fragment,{},t)}},d=r.forwardRef((function(e,t){var n=e.components,a=e.mdxType,i=e.originalType,p=e.parentName,c=s(e,["components","mdxType","originalType","parentName"]),d=l(n),m=a,g=d["".concat(p,".").concat(m)]||d[m]||u[m]||i;return n?r.createElement(g,o(o({ref:t},c),{},{components:n})):r.createElement(g,o({ref:t},c))}));function m(e,t){var n=arguments,a=t&&t.mdxType;if("string"==typeof e||a){var i=n.length,o=new Array(i);o[0]=d;var s={};for(var p in t)hasOwnProperty.call(t,p)&&(s[p]=t[p]);s.originalType=e,s.mdxType="string"==typeof e?e:a,o[1]=s;for(var l=2;l<i;l++)o[l]=n[l];return r.createElement.apply(null,o)}return r.createElement.apply(null,n)}d.displayName="MDXCreateElement"},4959:(e,t,n)=>{n.d(t,{Z:()=>s});var r=n(7294),a=n(9960),i=n(4477),o=n(2263);const s=function(e){var t=e.to,n=e.children,s=(0,i.E)();return(0,o.default)().siteConfig.presets[0][1].docs.disableVersioning?r.createElement(a.default,{to:"/api/"+t},n):r.createElement(a.default,{to:"/api/"+("current"===s.version?"next":s.version)+"/"+t},n)}},2812:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>d,contentTitle:()=>c,default:()=>f,frontMatter:()=>l,metadata:()=>u,toc:()=>m});var r=n(7462),a=n(3366),i=(n(7294),n(3905)),o=n(1435),s=n(4959);var p=["components"],l={id:"skip-navigation",title:"Skipping navigations for certain requests"},c=void 0,u={unversionedId:"examples/skip-navigation",id:"examples/skip-navigation",title:"Skipping navigations for certain requests",description:"While crawling a website, you may encounter certain resources you'd like to save, but don't need the full power of a crawler to do so (like images delivered through a CDN).",source:"@site/../docs/examples/skip-navigation.mdx",sourceDirName:"examples",slug:"/examples/skip-navigation",permalink:"/docs/examples/skip-navigation",draft:!1,tags:[],version:"current",lastUpdatedBy:"Andrey Bykov",lastUpdatedAt:1657805876,formattedLastUpdatedAt:"7/14/2022",frontMatter:{id:"skip-navigation",title:"Skipping navigations for certain requests"},sidebar:"docs",previous:{title:"Puppeteer with proxy",permalink:"/docs/examples/puppeteer-with-proxy"},next:{title:"Upgrading",permalink:"/docs/upgrading"}},d={},m=[],g={toc:m};function f(e){var t=e.components,n=(0,a.Z)(e,p);return(0,i.kt)("wrapper",(0,r.Z)({},g,n,{components:t,mdxType:"MDXLayout"}),(0,i.kt)("p",null,"While crawling a website, you may encounter certain resources you'd like to save, but don't need the full power of a crawler to do so (like images delivered through a CDN)."),(0,i.kt)("p",null,"By combining the ",(0,i.kt)(s.Z,{to:"core/class/Request#skipNavigation",mdxType:"ApiLink"},(0,i.kt)("inlineCode",{parentName:"p"},"Request#skipNavigation"))," option with ",(0,i.kt)(s.Z,{to:"basic-crawler/interface/BasicCrawlingContext#sendRequest",mdxType:"ApiLink"},(0,i.kt)("inlineCode",{parentName:"p"},"sendRequest")),", we can fetch the image from the CDN, and save it to our key-value store without needing to use the full crawler."),(0,i.kt)("div",{className:"admonition admonition-info alert alert--info"},(0,i.kt)("div",{parentName:"div",className:"admonition-heading"},(0,i.kt)("h5",{parentName:"div"},(0,i.kt)("span",{parentName:"h5",className:"admonition-icon"},(0,i.kt)("svg",{parentName:"span",xmlns:"http://www.w3.org/2000/svg",width:"14",height:"16",viewBox:"0 0 14 16"},(0,i.kt)("path",{parentName:"svg",fillRule:"evenodd",d:"M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z"}))),"info")),(0,i.kt)("div",{parentName:"div",className:"admonition-content"},(0,i.kt)("p",{parentName:"div"},"For this example, we are using the ",(0,i.kt)(s.Z,{to:"puppeteer-crawler/class/PuppeteerCrawler",mdxType:"ApiLink"},(0,i.kt)("inlineCode",{parentName:"p"},"PuppeteerCrawler"))," to showcase this, but this is available on all the crawlers we provide."))),(0,i.kt)(o.Z,{className:"language-js",mdxType:"CodeBlock"},"import { PuppeteerCrawler, KeyValueStore } from 'crawlee';\n\n// Create a key value store for all images we find\nconst imageStore = await KeyValueStore.open('images');\n\nconst crawler = new PuppeteerCrawler({\n    async requestHandler({ request, page, sendRequest }) {\n        // The request should have the navigation skipped\n        if (request.skipNavigation) {\n            // Request the image and get its buffer back\n            const imageBuffer = await sendRequest({ responseType: 'buffer' });\n\n            // Save the image in the key-value store\n            await imageStore.setValue(`${request.userData.key}.png`, imageBuffer);\n\n            // Prevent executing the rest of the code as we do not need it\n            return;\n        }\n\n        // Get all the image sources in the current page\n        const images = await page.$$eval('img', (imgs) => imgs.map((img) => img.src));\n\n        // Add all the urls as requests for the crawler, giving each image a key\n        await crawler.addRequests(images.map((url, i) => ({ url, skipNavigation: true, userData: { key: i } })));\n    },\n});\n\nawait crawler.addRequests(['https://apify.com/']);\n\n// Run the crawler\nawait crawler.run();\n"))}f.isMDXComponent=!0}}]);