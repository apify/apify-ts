"use strict";(self.webpackChunk=self.webpackChunk||[]).push([[2115],{2503:(e,r,n)=>{n.r(r),n.d(r,{default:()=>f});var t=n(7462),a=n(3366),o=n(7294),l=n(6010),i=n(5999),u=n(6668);const s="anchorWithStickyNavbar_LWe7",c="anchorWithHideOnScrollNavbar_WYt5";var d=["as","id"];function f(e){var r=e.as,n=e.id,f=(0,a.Z)(e,d),m=(0,u.L)().navbar.hideOnScroll;return"h1"!==r&&n?o.createElement(r,(0,t.Z)({},f,{className:(0,l.Z)("anchor",m?c:s),id:n}),f.children,o.createElement("a",{className:"hash-link",href:"#"+n,title:(0,i.I)({id:"theme.common.headingLinkTitle",message:"Direct link to heading",description:"Title for link to heading"})},"\u200b")):o.createElement(r,(0,t.Z)({},f,{id:void 0}))}},4353:(e,r,n)=>{n.d(r,{D:()=>i,f:()=>u});var t=n(7294),a=n(9688),o=Symbol("EmptyContext"),l=t.createContext(o);function i(e){var r=e.children,n=(0,t.useState)(null),a=n[0],o=n[1],i=(0,t.useMemo)((function(){return{expandedItem:a,setExpandedItem:o}}),[a]);return t.createElement(l.Provider,{value:i},r)}function u(){var e=(0,t.useContext)(l);if(e===o)throw new a.i6("DocSidebarItemsExpandedStateProvider");return e}},2730:(e,r,n)=>{n.d(r,{a:()=>l});var t=n(7294),a=n(2466),o=n(5936);function l(e){var r=e.threshold,n=(0,t.useState)(!1),l=n[0],i=n[1],u=(0,t.useRef)(!1),s=(0,a.Ct)(),c=s.startScroll,d=s.cancelScroll;return(0,a.RF)((function(e,n){var t=e.scrollY,a=null==n?void 0:n.scrollY;a&&(u.current?u.current=!1:t>=a?(d(),i(!1)):t<r?i(!1):t+window.innerHeight<document.documentElement.scrollHeight&&i(!0))})),(0,o.S)((function(e){e.location.hash&&(u.current=!0,i(!1))})),{shown:l,scrollToTop:function(){return c(0)}}}},6841:(e,r,n)=>{n.d(r,{S:()=>u});var t=n(7294),a=n(6668);function o(e){var r=e.getBoundingClientRect();return r.top===r.bottom?o(e.parentNode):r}function l(e,r){var n,t,a=r.anchorTopOffset,l=e.find((function(e){return o(e).top>=a}));return l?function(e){return e.top>0&&e.bottom<window.innerHeight/2}(o(l))?l:null!=(t=e[e.indexOf(l)-1])?t:null:null!=(n=e[e.length-1])?n:null}function i(){var e=(0,t.useRef)(0),r=(0,a.L)().navbar.hideOnScroll;return(0,t.useEffect)((function(){e.current=r?0:document.querySelector(".navbar").clientHeight}),[r]),e}function u(e){var r=(0,t.useRef)(void 0),n=i();(0,t.useEffect)((function(){if(!e)return function(){};var t=e.linkClassName,a=e.linkActiveClassName,o=e.minHeadingLevel,i=e.maxHeadingLevel;function u(){var e=function(e){return Array.from(document.getElementsByClassName(e))}(t),u=function(e){for(var r=e.minHeadingLevel,n=e.maxHeadingLevel,t=[],a=r;a<=n;a+=1)t.push("h"+a+".anchor");return Array.from(document.querySelectorAll(t.join()))}({minHeadingLevel:o,maxHeadingLevel:i}),s=l(u,{anchorTopOffset:n.current}),c=e.find((function(e){return s&&s.id===function(e){return decodeURIComponent(e.href.substring(e.href.indexOf("#")+1))}(e)}));e.forEach((function(e){!function(e,n){n?(r.current&&r.current!==e&&r.current.classList.remove(a),e.classList.add(a),r.current=e):e.classList.remove(a)}(e,e===c)}))}return document.addEventListener("scroll",u),document.addEventListener("resize",u),u(),function(){document.removeEventListener("scroll",u),document.removeEventListener("resize",u)}}),[e,n])}},549:(e,r,n)=>{n.r(r),n.d(r,{AnnouncementBarProvider:()=>T.pl,Collapsible:()=>L.z,ColorModeProvider:()=>B.S,DEFAULT_SEARCH_TAG:()=>c.HX,DocSidebarItemsExpandedStateProvider:()=>a.D,DocsPreferredVersionContextProvider:()=>P.L5,DocsSidebarProvider:()=>l.b,DocsVersionProvider:()=>o.q,HtmlClassNameProvider:()=>A.FG,NavbarProvider:()=>_.V,NavbarSecondaryMenuFiller:()=>W.Zo,PageMetadata:()=>A.d,PluginHtmlClassNameProvider:()=>A.VC,ReactContextError:()=>O.i6,ScrollControllerProvider:()=>w.OC,TabGroupChoiceProvider:()=>j.z,ThemeClassNames:()=>y.k,containsLineNumbers:()=>s.nt,createStorageSlot:()=>i.W,docVersionSearchTag:()=>c.os,duplicates:()=>E.l,findFirstCategoryLink:()=>d.Wl,findSidebarCategory:()=>d.em,getPrismCssVariables:()=>s.QC,isActiveSidebarItem:()=>d._F,isDocsPluginEnabled:()=>d.cE,isMultiColumnFooterLinks:()=>M.a,isRegexpStringMatch:()=>R.F,isSamePath:()=>V.Mg,keyboardFocusedClassName:()=>G.h,listStorageKeys:()=>i._,listTagsByLetters:()=>F,parseCodeBlockTitle:()=>s.bc,parseLanguage:()=>s.Vo,parseLines:()=>s.nZ,splitNavbarItems:()=>_.A,translateTagsPageTitle:()=>H,uniq:()=>E.j,useAlternatePageUtils:()=>u.l,useAnnouncementBar:()=>T.nT,useBackToTopButton:()=>q.a,useCodeWordWrap:()=>ee.F,useCollapsible:()=>L.u,useColorMode:()=>B.I,useContextualSearchFilters:()=>c._q,useCurrentSidebarCategory:()=>d.jA,useDocById:()=>d.xz,useDocRouteMetadata:()=>d.hI,useDocSidebarItemsExpandedState:()=>a.f,useDocsPreferredVersion:()=>P.J,useDocsPreferredVersionByPluginId:()=>P.Oh,useDocsSidebar:()=>l.V,useDocsVersion:()=>o.E,useDocsVersionCandidates:()=>d.lO,useDynamicCallback:()=>O.ed,useFilteredAndTreeifiedTOC:()=>I.b,useHideableNavbar:()=>Z.c,useHistoryPopHandler:()=>D.R,useHomePageRoute:()=>V.Ns,useIsomorphicLayoutEffect:()=>O.LI,useKeyboardNavigation:()=>G.t,useLayoutDoc:()=>d.vY,useLayoutDocsSidebar:()=>d.oz,useLocalPathname:()=>x.b,useLocationChange:()=>S.S,useLockBodyScroll:()=>Q.N,useNavbarMobileSidebar:()=>U.e,useNavbarSecondaryMenu:()=>z.Y,usePluralForm:()=>C,usePrevious:()=>O.D9,usePrismTheme:()=>Y.p,useScrollController:()=>w.sG,useScrollPosition:()=>w.RF,useScrollPositionBlocker:()=>w.o5,useSearchPage:()=>$,useSidebarBreadcrumbs:()=>d.s1,useSkipToContent:()=>re.a,useSmoothScrollTo:()=>w.Ct,useTOCHighlight:()=>N.S,useTabGroupChoice:()=>j.U,useThemeConfig:()=>t.L,useTitleFormatter:()=>f.p,useTreeifiedTOC:()=>I.a,useWindowSize:()=>K.i});var t=n(6668),a=n(4353),o=n(4477),l=n(1116),i=n(12),u=n(4711),s=n(7016),c=n(3320),d=n(3791),f=n(2128),m=n(7294),v=n(2263),h=["zero","one","two","few","many","other"];function g(e){return h.filter((function(r){return e.includes(r)}))}var p={locale:"en",pluralForms:g(["one","other"]),select:function(e){return 1===e?"one":"other"}};function b(){var e=(0,v.default)().i18n.currentLocale;return(0,m.useMemo)((function(){try{return r=e,n=new Intl.PluralRules(r),{locale:r,pluralForms:g(n.resolvedOptions().pluralCategories),select:function(e){return n.select(e)}}}catch(t){return console.error('Failed to use Intl.PluralRules for locale "'+e+'".\nDocusaurus will fallback to the default (English) implementation.\nError: '+t.message+"\n"),p}var r,n}),[e])}function C(){var e=b();return{selectMessage:function(r,n){return function(e,r,n){var t=e.split("|");if(1===t.length)return t[0];t.length>n.pluralForms.length&&console.error("For locale="+n.locale+", a maximum of "+n.pluralForms.length+" plural forms are expected ("+n.pluralForms.join(",")+"), but the message contains "+t.length+": "+e);var a=n.select(r),o=n.pluralForms.indexOf(a);return t[Math.min(o,t.length-1)]}(n,r,e)}}}var S=n(5936),L=n(6043),P=n(373),E=n(7392),y=n(5281),T=n(9689),x=n(1753),k=n(5999),H=function(){return(0,k.I)({id:"theme.tags.tagsPageTitle",message:"Tags",description:"The title of the tag list page"})};function F(e){var r={};return Object.values(e).forEach((function(e){var n=function(e){return e[0].toUpperCase()}(e.label);null!=r[n]||(r[n]=[]),r[n].push(e)})),Object.entries(r).sort((function(e,r){var n=e[0],t=r[0];return n.localeCompare(t)})).map((function(e){return{letter:e[0],tags:e[1].sort((function(e,r){return e.label.localeCompare(r.label)}))}}))}var D=n(1980),N=n(6841),I=n(9665),M=n(2489),w=n(2466),O=n(9688),R=n(8022),V=n(8596),A=n(833),B=n(2949),_=n(8978),j=n(7094),U=n(3163),W=n(3102),z=n(6857),q=n(2730),Z=n(9445),G=n(9727),Y=n(6412),Q=n(9800),K=n(7524),J=n(6775),X="q";function $(){var e=(0,J.k6)(),r=(0,v.default)().siteConfig.baseUrl,n=(0,m.useState)(""),t=n[0],a=n[1];return(0,m.useEffect)((function(){var e,r=null!=(e=new URLSearchParams(window.location.search).get(X))?e:"";a(r)}),[]),{searchQuery:t,setSearchQuery:(0,m.useCallback)((function(r){var n=new URLSearchParams(window.location.search);r?n.set(X,r):n.delete(X),e.replace({search:n.toString()}),a(r)}),[e]),generateSearchPageLink:(0,m.useCallback)((function(e){return r+"search?"+"q="+encodeURIComponent(e)}),[r])}}var ee=n(5866),re=n(8721)},9665:(e,r,n)=>{n.d(r,{a:()=>i,b:()=>s});var t=n(3366),a=n(7294),o=["parentIndex"];function l(e){var r=e.map((function(e){return Object.assign({},e,{parentIndex:-1,children:[]})})),n=Array(7).fill(-1);r.forEach((function(e,r){var t=n.slice(2,e.level);e.parentIndex=Math.max.apply(Math,t),n[e.level]=r}));var a=[];return r.forEach((function(e){var n=e.parentIndex,l=(0,t.Z)(e,o);n>=0?r[n].children.push(l):a.push(l)})),a}function i(e){return(0,a.useMemo)((function(){return l(e)}),[e])}function u(e){var r=e.toc,n=e.minHeadingLevel,t=e.maxHeadingLevel;return r.flatMap((function(e){var r=u({toc:e.children,minHeadingLevel:n,maxHeadingLevel:t});return function(e){return e.level>=n&&e.level<=t}(e)?[Object.assign({},e,{children:r})]:r}))}function s(e){var r=e.toc,n=e.minHeadingLevel,t=e.maxHeadingLevel;return(0,a.useMemo)((function(){return u({toc:l(r),minHeadingLevel:n,maxHeadingLevel:t})}),[r,n,t])}},5098:(e,r,n)=>{Object.defineProperty(r,"__esModule",{value:!0});var t=function(e){return e&&e.__esModule?e:{default:e}}(n(7294));r.Footer=function(){return t.default.createElement("footer",{className:"tsd-footer"},"Powered by"," ",t.default.createElement("a",{href:"https://github.com/milesj/docusaurus-plugin-typedoc-api"},"docusaurus-plugin-typedoc-api")," ","and ",t.default.createElement("a",{href:"https://typedoc.org/"},"TypeDoc"))}},5296:(e,r,n)=>{Object.defineProperty(r,"__esModule",{value:!0});var t=n(7294),a=n(9960),o=n(143),l=n(549),i=function(e){return e&&e.__esModule?e:{default:e}},u=i(t),s=i(a);r.VersionBanner=function(e){var r=e.versionMetadata,n=r.banner,a=r.pluginId,i=r.version,c=o.useDocVersionSuggestions(a).latestVersionSuggestion,d=l.useDocsPreferredVersion(a).savePreferredVersionName,f=t.useCallback((function(){d(c.name)}),[c.name,d]);if(!n||!c)return null;var m=r.docs[c.label];return u.default.createElement("div",{className:l.ThemeClassNames.docs.docVersionBanner+" alert alert--warning margin-bottom--md",role:"alert"},u.default.createElement("div",null,"unreleased"===n&&u.default.createElement(u.default.Fragment,null,"This is documentation for an unreleased version."),"unmaintained"===n&&u.default.createElement(u.default.Fragment,null,"This is documentation for version ",u.default.createElement("b",null,i),".")," ","For the latest API, see version"," ",u.default.createElement("b",null,u.default.createElement(s.default,{to:m.id,onClick:f},m.title)),"."))}}}]);