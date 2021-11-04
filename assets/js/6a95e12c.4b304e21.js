"use strict";(self.webpackChunk=self.webpackChunk||[]).push([[5824,4972,9514],{4651:(e,t,n)=>{n.r(t),n.d(t,{default:()=>Ne});var a=n(7294),r=n(6010),l=n(3791),o=n(3320),i=n(833),c=n(5281),s=n(4477),d=n(1116),u=n(8643),m=n(5999),p=n(2730);const b="backToTopButton_sjWU",f="backToTopButtonShow_xfvO";function v(){var e=(0,p.a)({threshold:300}),t=e.shown,n=e.scrollToTop;return a.createElement("button",{"aria-label":(0,m.I)({id:"theme.BackToTopButton.buttonAriaLabel",message:"Scroll back to top",description:"The ARIA label for the back to top button"}),className:(0,r.Z)("clean-btn",c.k.common.backToTopButton,b,t&&f),type:"button",onClick:n})}var h=n(6775),E=n(7524),g=n(6668),_=n(1327),k=n(7462);function C(e){return a.createElement("svg",(0,k.Z)({width:"20",height:"20","aria-hidden":"true"},e),a.createElement("g",{fill:"#7a7a7a"},a.createElement("path",{d:"M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0"}),a.createElement("path",{d:"M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0"})))}const I="collapseSidebarButton_PEFL",y="collapseSidebarButtonIcon_kv0_";function N(e){var t=e.onClick;return a.createElement("button",{type:"button",title:(0,m.I)({id:"theme.docs.sidebar.collapseButtonTitle",message:"Collapse sidebar",description:"The title attribute for collapse button of doc sidebar"}),"aria-label":(0,m.I)({id:"theme.docs.sidebar.collapseButtonAriaLabel",message:"Collapse sidebar",description:"The title attribute for collapse button of doc sidebar"}),className:(0,r.Z)("button button--secondary button--outline",I),onClick:t},a.createElement(C,{className:y}))}var S=n(9689),Z=n(2466),x=n(3366),T=n(4353),A=n(9688),L=n(8596),w=n(6043),M=n(9960),P=n(2389),F=["item","onItemClick","activePath","level","index"];function B(e){var t=e.categoryLabel,n=e.onClick;return a.createElement("button",{"aria-label":(0,m.I)({id:"theme.DocSidebarItem.toggleCollapsedCategoryAriaLabel",message:"Toggle the collapsible sidebar category '{label}'",description:"The ARIA label to toggle the collapsible sidebar category"},{label:t}),type:"button",className:"clean-btn menu__caret",onClick:n})}function H(e){var t=e.item,n=e.onItemClick,o=e.activePath,i=e.level,s=e.index,d=(0,x.Z)(e,F),u=t.items,m=t.label,p=t.collapsible,b=t.className,f=t.href,v=(0,g.L)().docs.sidebar.autoCollapseCategories,h=function(e){var t=(0,P.Z)();return(0,a.useMemo)((function(){return e.href?e.href:!t&&e.collapsible?(0,l.Wl)(e):void 0}),[e,t])}(t),E=(0,l._F)(t,o),_=(0,L.Mg)(f,o),C=(0,w.u)({initialState:function(){return!!p&&(!E&&t.collapsed)}}),I=C.collapsed,y=C.setCollapsed,N=(0,T.f)(),S=N.expandedItem,Z=N.setExpandedItem,H=function(e){void 0===e&&(e=!I),Z(e?null:s),y(e)};return function(e){var t=e.isActive,n=e.collapsed,r=e.updateCollapsed,l=(0,A.D9)(t);(0,a.useEffect)((function(){t&&!l&&n&&r(!1)}),[t,l,n,r])}({isActive:E,collapsed:I,updateCollapsed:H}),(0,a.useEffect)((function(){p&&S&&S!==s&&v&&y(!0)}),[p,S,s,y,v]),a.createElement("li",{className:(0,r.Z)(c.k.docs.docSidebarItemCategory,c.k.docs.docSidebarItemCategoryLevel(i),"menu__list-item",{"menu__list-item--collapsed":I},b)},a.createElement("div",{className:(0,r.Z)("menu__list-item-collapsible",{"menu__list-item-collapsible--active":_})},a.createElement(M.default,(0,k.Z)({className:(0,r.Z)("menu__link",{"menu__link--sublist":p,"menu__link--sublist-caret":!f&&p,"menu__link--active":E}),onClick:p?function(e){null==n||n(t),f?H(!1):(e.preventDefault(),H())}:function(){null==n||n(t)},"aria-current":_?"page":void 0,"aria-expanded":p?!I:void 0,href:p?null!=h?h:"#":h},d),m),f&&p&&a.createElement(B,{categoryLabel:m,onClick:function(e){e.preventDefault(),H()}})),a.createElement(w.z,{lazy:!0,as:"ul",className:"menu__list",collapsed:I},a.createElement(q,{items:u,tabIndex:I?-1:0,onItemClick:n,activePath:o,level:i+1})))}var D=n(3919),O=n(8483);const W="menuExternalLink_NmtK";var j=["item","onItemClick","activePath","level","index"];function R(e){var t=e.item,n=e.onItemClick,o=e.activePath,i=e.level,s=(e.index,(0,x.Z)(e,j)),d=t.href,u=t.label,m=t.className,p=(0,l._F)(t,o),b=(0,D.Z)(d);return a.createElement("li",{className:(0,r.Z)(c.k.docs.docSidebarItemLink,c.k.docs.docSidebarItemLinkLevel(i),"menu__list-item",m),key:u},a.createElement(M.default,(0,k.Z)({className:(0,r.Z)("menu__link",!b&&W,{"menu__link--active":p}),"aria-current":p?"page":void 0,to:d},b&&{onClick:n?function(){return n(t)}:void 0},s),u,!b&&a.createElement(O.Z,null)))}const z="menuHtmlItem_M9Kj";function K(e){var t=e.item,n=e.level,l=e.index,o=t.value,i=t.defaultStyle,s=t.className;return a.createElement("li",{className:(0,r.Z)(c.k.docs.docSidebarItemLink,c.k.docs.docSidebarItemLinkLevel(n),i&&[z,"menu__list-item"],s),key:l,dangerouslySetInnerHTML:{__html:o}})}var U=["item"];function V(e){var t=e.item,n=(0,x.Z)(e,U);switch(t.type){case"category":return a.createElement(H,(0,k.Z)({item:t},n));case"html":return a.createElement(K,(0,k.Z)({item:t},n));default:return a.createElement(R,(0,k.Z)({item:t},n))}}var G=["items"];function Y(e){var t=e.items,n=(0,x.Z)(e,G);return a.createElement(T.D,null,t.map((function(e,t){return a.createElement(V,(0,k.Z)({key:t,item:e,index:t},n))})))}const q=(0,a.memo)(Y),X="menu_SIkG",J="menuWithAnnouncementBar_GW3s";function Q(e){var t=e.path,n=e.sidebar,l=e.className,o=function(){var e=(0,S.nT)().isActive,t=(0,a.useState)(e),n=t[0],r=t[1];return(0,Z.RF)((function(t){var n=t.scrollY;e&&r(0===n)}),[e]),e&&n}();return a.createElement("nav",{className:(0,r.Z)("menu thin-scrollbar",X,o&&J,l)},a.createElement("ul",{className:(0,r.Z)(c.k.docs.docSidebarMenu,"menu__list")},a.createElement(q,{items:n,activePath:t,level:1})))}const $="sidebar_njMd",ee="sidebarWithHideableNavbar_wUlq",te="sidebarHidden_VK0M",ne="sidebarLogo_isFc";function ae(e){var t=e.path,n=e.sidebar,l=e.onCollapse,o=e.isHidden,i=(0,g.L)(),c=i.navbar.hideOnScroll,s=i.docs.sidebar.hideable;return a.createElement("div",{className:(0,r.Z)($,c&&ee,o&&te)},c&&a.createElement(_.Z,{tabIndex:-1,className:ne}),a.createElement(Q,{path:t,sidebar:n}),s&&a.createElement(N,{onClick:l}))}const re=a.memo(ae);var le=n(3163),oe=n(3102),ie=function(e){var t=e.sidebar,n=e.path,l=(0,le.e)();return a.createElement("ul",{className:(0,r.Z)(c.k.docs.docSidebarMenu,"menu__list")},a.createElement(q,{items:t,activePath:n,onItemClick:function(e){"category"===e.type&&e.href&&l.toggle(),"link"===e.type&&l.toggle()},level:1}))};function ce(e){return a.createElement(oe.Zo,{component:ie,props:e})}const se=a.memo(ce);function de(e){var t=(0,E.i)(),n="desktop"===t||"ssr"===t,r="mobile"===t;return a.createElement(a.Fragment,null,n&&a.createElement(re,e),r&&a.createElement(se,e))}const ue="expandButton_m80_",me="expandButtonIcon_BlDH";function pe(e){var t=e.toggleSidebar;return a.createElement("div",{className:ue,title:(0,m.I)({id:"theme.docs.sidebar.expandButtonTitle",message:"Expand sidebar",description:"The ARIA label and title attribute for expand button of doc sidebar"}),"aria-label":(0,m.I)({id:"theme.docs.sidebar.expandButtonAriaLabel",message:"Expand sidebar",description:"The ARIA label and title attribute for expand button of doc sidebar"}),tabIndex:0,role:"button",onKeyDown:t,onClick:t},a.createElement(C,{className:me}))}const be="docSidebarContainer_b6E3",fe="docSidebarContainerHidden_b3ry";function ve(e){var t,n=e.children,r=(0,d.V)();return a.createElement(a.Fragment,{key:null!=(t=null==r?void 0:r.name)?t:"noSidebar"},n)}function he(e){var t=e.sidebar,n=e.hiddenSidebarContainer,l=e.setHiddenSidebarContainer,o=(0,h.TH)().pathname,i=(0,a.useState)(!1),s=i[0],d=i[1],u=(0,a.useCallback)((function(){s&&d(!1),l((function(e){return!e}))}),[l,s]);return a.createElement("aside",{className:(0,r.Z)(c.k.docs.docSidebarContainer,be,n&&fe),onTransitionEnd:function(e){e.currentTarget.classList.contains(be)&&n&&d(!0)}},a.createElement(ve,null,a.createElement(de,{sidebar:t,path:o,onCollapse:u,isHidden:s})),s&&a.createElement(pe,{toggleSidebar:u}))}const Ee={docMainContainer:"docMainContainer_gTbr",docMainContainerEnhanced:"docMainContainerEnhanced_Uz_u",docItemWrapperEnhanced:"docItemWrapperEnhanced_czyv"};function ge(e){var t=e.hiddenSidebarContainer,n=e.children,l=(0,d.V)();return a.createElement("main",{className:(0,r.Z)(Ee.docMainContainer,(t||!l)&&Ee.docMainContainerEnhanced)},a.createElement("div",{className:(0,r.Z)("container padding-top--md padding-bottom--lg",Ee.docItemWrapper,t&&Ee.docItemWrapperEnhanced)},n))}const _e="docPage__5DB",ke="docsWrapper_BCFX";function Ce(e){var t=e.children,n=(0,d.V)(),r=(0,a.useState)(!1),l=r[0],o=r[1];return a.createElement(u.Z,{wrapperClassName:ke},a.createElement(v,null),a.createElement("div",{className:_e},n&&a.createElement(he,{sidebar:n.items,hiddenSidebarContainer:l,setHiddenSidebarContainer:o}),a.createElement(ge,{hiddenSidebarContainer:l},t)))}var Ie=n(4972),ye=n(197);function Ne(e){var t=e.versionMetadata,n=(0,l.hI)(e);if(!n)return a.createElement(Ie.default,null);var u=n.docElement,m=n.sidebarName,p=n.sidebarItems;return a.createElement(a.Fragment,null,a.createElement(ye.Z,{version:t.version,tag:(0,o.os)(t.pluginId,t.version)}),a.createElement(i.FG,{className:(0,r.Z)(c.k.wrapper.docsPages,c.k.page.docsDocPage,e.versionMetadata.className)},a.createElement(s.q,{version:t},a.createElement(d.b,{name:m,items:p},a.createElement(Ce,null,u)))))}},4972:(e,t,n)=>{n.r(t),n.d(t,{default:()=>i});var a=n(7294),r=n(5999),l=n(833),o=n(8643);function i(){return a.createElement(a.Fragment,null,a.createElement(l.d,{title:(0,r.I)({id:"theme.NotFound.title",message:"Page Not Found"})}),a.createElement(o.Z,null,a.createElement("main",{className:"container margin-vert--xl"},a.createElement("div",{className:"row"},a.createElement("div",{className:"col col--6 col--offset-3"},a.createElement("h1",{className:"hero__title"},a.createElement(r.Z,{id:"theme.NotFound.title",description:"The title of the 404 page"},"Page Not Found")),a.createElement("p",null,a.createElement(r.Z,{id:"theme.NotFound.p1",description:"The first paragraph of the 404 page"},"We could not find what you were looking for.")),a.createElement("p",null,a.createElement(r.Z,{id:"theme.NotFound.p2",description:"The 2nd paragraph of the 404 page"},"Please contact the owner of the site that linked you to the original URL and let them know their link is broken.")))))))}},4353:(e,t,n)=>{n.d(t,{D:()=>i,f:()=>c});var a=n(7294),r=n(9688),l=Symbol("EmptyContext"),o=a.createContext(l);function i(e){var t=e.children,n=(0,a.useState)(null),r=n[0],l=n[1],i=(0,a.useMemo)((function(){return{expandedItem:r,setExpandedItem:l}}),[r]);return a.createElement(o.Provider,{value:i},t)}function c(){var e=(0,a.useContext)(o);if(e===l)throw new r.i6("DocSidebarItemsExpandedStateProvider");return e}},2730:(e,t,n)=>{n.d(t,{a:()=>o});var a=n(7294),r=n(2466),l=n(5936);function o(e){var t=e.threshold,n=(0,a.useState)(!1),o=n[0],i=n[1],c=(0,a.useRef)(!1),s=(0,r.Ct)(),d=s.startScroll,u=s.cancelScroll;return(0,r.RF)((function(e,n){var a=e.scrollY,r=null==n?void 0:n.scrollY;r&&(c.current?c.current=!1:a>=r?(u(),i(!1)):a<t?i(!1):a+window.innerHeight<document.documentElement.scrollHeight&&i(!0))})),(0,l.S)((function(e){e.location.hash&&(c.current=!0,i(!1))})),{shown:o,scrollToTop:function(){return d(0)}}}},149:(e,t,n)=>{Object.defineProperty(t,"__esModule",{value:!0});var a=n(7294).createContext({options:{banner:"",breadcrumbs:!0,gitRefName:"master",minimal:!1,pluginId:"default",scopes:[]},reflections:{}});t.ApiDataContext=a},6454:(e,t,n)=>{var a=n(9486);e.exports=a},9486:(e,t,n)=>{var a=["options","packages"];function r(e,t){if(null==e)return{};var n,a,r=function(e,t){if(null==e)return{};var n,a,r={},l=Object.keys(e);for(a=0;a<l.length;a++)n=l[a],t.indexOf(n)>=0||(r[n]=e[n]);return r}(e,t);if(Object.getOwnPropertySymbols){var l=Object.getOwnPropertySymbols(e);for(a=0;a<l.length;a++)n=l[a],t.indexOf(n)>=0||Object.prototype.propertyIsEnumerable.call(e,n)&&(r[n]=e[n])}return r}n(60),n(8878);var l=n(7294),o=n(4651),i=n(149),c=function(e){return e&&e.__esModule?e:{default:e}},s=c(l),d=c(o);function u(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function m(e,t,n){return Object.entries(e).forEach((function(a){var r=a[0],l=a[1];if("id"===r){var o="type"in e;(!o||o&&"reference"!==e.type)&&(t[Number(l)]=e,n&&(e.parentId=n.id))}else Array.isArray(l)?l.forEach((function(n){u(n)&&m(n,t,e)})):u(l)&&m(l,t,e)})),t}function p(e){var t={};return e.forEach((function(e){e.entryPoints.forEach((function(e){m(e.reflection,t)}))})),t}e.exports=function(e){var t=e.options,n=e.packages,o=r(e,a),c=l.useMemo((function(){return{options:t,reflections:p(n)}}),[t,n]);return s.default.createElement(i.ApiDataContext.Provider,{value:c},s.default.createElement("div",{className:"apiPage"},s.default.createElement(d.default,o)))}},60:(e,t,n)=>{n.r(t)},8878:(e,t,n)=>{n.r(t)}}]);