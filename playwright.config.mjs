import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,timeout:60000,
  expect:{timeout:15000},outputDir:'outputs/browser-acceptance/results',
  reporter:[['list'],['html',{outputFolder:'outputs/browser-acceptance/report',open:'never'}]],
  use:{baseURL:'http://127.0.0.1:8146',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
  webServer:{command:'node scripts/preview-library-acceptance.mjs',url:'http://127.0.0.1:8147/counts',reuseExistingServer:false,timeout:60000},
});
