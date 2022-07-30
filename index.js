const os = require('os');
const fs = require('fs');
const path = require('path');
const proc = require('child_process');
const rimraf = require('rimraf');
const chalk = require('chalk');
const inquirer = require('inquirer');

const nginxDir = '/etc/nginx/sites-enabled';
const certsDir = '/etc/nginx/certs';
const acmeDir = '/root/.acme.sh';
const localStateFile = path.resolve(__dirname, './localstate.json');
let localState = {};
const siteTemplateFile = path.resolve(__dirname, './site-template.txt');
let siteTemplate = '';
const sites = [];

const failFatal = msg => {
  console.log(`${chalk.red('#')} ${chalk.bold(msg)}`);
  exit(1);
};

const saveState = () => fs.promises.writeFile(localStateFile, JSON.stringify(localState));

async function run() {
  console.log(chalk.bgRed.white('### Proxio ###\n'));

  // Load local state (if available)
  if (fs.existsSync(localStateFile)) {
    const config = await fs.promises.readFile(localStateFile, 'utf-8');
    localState = JSON.parse(config);
  }

  // Load template for new sites
  if (!fs.existsSync(siteTemplateFile)) {
    failFatal(`Missing config file: ${siteTemplateFile}`);
  }

  siteTemplate = await fs.promises.readFile(siteTemplateFile, 'utf8');

  // Create certs folder if needed
  if (!fs.existsSync(certsDir)) {
    await fs.promises.mkdir(certsDir);
  }
    
  // Lookup all existing sites 
  const configs = await fs.promises.readdir(nginxDir);
  console.log(chalk.bold('Current sites:'));

  for (const site of configs) {
    const config = await fs.promises.readFile(`${nginxDir}/${site}`, 'utf-8');
    const forwardTo = config.match(/proxy_pass (.+);/)[1];
    console.log(`  ${site.replace('.conf', '')} ${chalk.blueBright('->')} ${forwardTo}`);
  }

  // Main loop
  await mainMenu('What would you like to do?');
}

async function mainMenu(message) {
  console.log('');
  const { action } = await inquirer.prompt({
    message,
    name: 'action',
    type: 'list',
    choices: ['Add site', 'Remove site', 'Force renew', 'Quit']
  });
  
  switch (action) {
    case 'Add site': await AddSite(); break;
    case 'Remove site': break;
    case 'Force renew': break;
    default: console.log('bye!'); process.exit(0);
  }
  return mainMenu('Anything else?');
}

async function reloadNginx() {
  console.log(`${chalk.magenta('-')} ${chalk.bold('Reloading nginx...')}`);
  return new Promise(r => proc.spawn('systemctl', ['restart', 'nginx']).on('close', r));
}

async function acmeCmd(args) {
  const argArray = args.split(' ');
  const options = { stdio: 'inherit' };
  return new Promise(r => proc.spawn(`${acmeDir}/acme.sh`, argArray, options).on('close', r));
}

async function verifyAccount() {
  if (!fs.existsSync(`${acmeDir}/ca`)) {
    console.log(chalk.bold.gray('\n  Please provide ZeroSSL API creds:'));
    const creds = await inquirer.prompt([
      { name: 'eab-kid', type: 'input' },
      { name: 'eab-hmac-key', type: 'input' },
    ]);

    console.log(`${chalk.magenta('\n-')} ${chalk.bold('Registering account...')}`);
    const exitCode = await acmeCmd(`--force --register-account --server zerossl --eab-kid ${creds['eab-kid']} --eab-hmac-key ${creds['eab-hmac-key']}`);
    console.log('');
    
    if (exitCode !== 0) {
      await new Promise(r => rimraf(`${acmeDir}/ca`, r));
      failFatal('Something appears to have gone wrong :(');
    }
  }
}

async function AddSite() {
  await verifyAccount();

  console.log(chalk.bold.gray('\n  New site'));
  const opts = await inquirer.prompt([
    { message: 'Domain name:', name: 'domain', type: 'input' },
    { message: 'Cloudflare token:', name: 'cfToken', type: 'input', default: localState.cfToken },
    { message: 'Cloudflare account ID:', name: 'cfAcct', type: 'input', default: localState.cfAcct },
    { message: 'Internal IP:', name: 'proxyIp', type: 'input' },
    { message: 'Internal Port:', name: 'proxyPort', type: 'input' }
  ]);

  process.env['CF_Token'] = opts.cfToken;
  process.env['CF_Account_ID'] = opts.cfAcct;
  localState.cfToken = opts.cfToken;
  localState.cfAcct = opts.cfAcct;
  
  console.log(`${chalk.magenta('\n-')} ${chalk.bold('Registering site...')}`);
  const exitCode = await acmeCmd(`--force --issue --dns dns_cf --server zerossl -d ${opts.domain} --fullchainpath ${certsDir}/${opts.domain}.cer --keypath ${certsDir}/${opts.domain}.key`);
  console.log('');
    
  if (exitCode !== 0) {
    failFatal('Something appears to have gone wrong :(');
  }

  const siteEntry = siteTemplate
    .replace(/@@DOMAIN/g, opts.domain)
    .replace(/@@IP/g, opts.proxyIp)
    .replace(/@@PORT/g, opts.proxyPort);

  await fs.promises.writeFile(`${nginxDir}/${opts.domain}.conf`, siteEntry);
  await reloadNginx();
  await saveState();
}

if (os.userInfo().uid === 0) {
  if (fs.existsSync(nginxDir)) {
    if (fs.existsSync(acmeDir)) {
      run();
    }
    else {
      console.log(`${chalk.bgRed.white(' ERROR! ')} Acme.sh not found! Run ${chalk.magentaBright('./install.sh local')} first`);
    }
  }
  else {
    console.log(`${chalk.bgRed.white(' ERROR! ')} Nginx not found! Run ${chalk.magentaBright('./install.sh local')} first`);
  }
}
else {
  proc.spawn('sudo', ['node', `${__filename}`], { stdio: 'inherit' });
}