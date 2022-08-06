const os = require('os');
const fs = require('fs');
const path = require('path');
const proc = require('child_process');
const rimraf = require('rimraf');
const chalk = require('chalk');
const inquirer = require('inquirer');

const nodeDir = '/usr/bin';
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
  process.exit(1);
};

const saveState = () => fs.promises.writeFile(localStateFile, JSON.stringify(localState));

async function run() {
  console.log(chalk.bgRed.white('### Proxio ###\n'));

  // Check for headless mode
  if (process.argv.indexOf('--cron') >= 0) {
    await acmeCmd(`--cron --home ${acmeDir}`);
    await reloadNginx();
    process.exit(0);
  }

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
    const siteName = site.replace('.conf', '');
    const config = await fs.promises.readFile(`${nginxDir}/${site}`, 'utf-8');
    const forwardTo = config.match(/proxy_pass (.+);/)[1];
    console.log(`  ${siteName} ${chalk.blueBright('->')} ${forwardTo}`);
    sites.push(siteName);
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
    choices: ['Add site', 'Remove site', 'Enable CRON', 'Quit']
  });

  switch (action) {
    case 'Add site': await AddSite(); break;
    case 'Remove site': await RemoveSite(); break;
    case 'Enable CRON': await EnableCron(); break;
    default: console.log('bye!'); process.exit(0);
  }
  return mainMenu('Anything else?');
}

async function reloadNginx() {
  process.stdout.write(`${chalk.magenta('-')} ${chalk.bold('Reloading nginx...')}`);
  await new Promise(r => proc.spawn('systemctl', ['restart', 'nginx']).on('close', r));
  console.log(`${chalk.bold.green('Sucess')}`);
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
  sites.push(opts.domain);
}

async function RemoveSite() {
  console.log(chalk.bold.gray('\n  Remove site'));
  const { target } = await inquirer.prompt({
    message: 'Site: ',
    name: 'target',
    type: 'list',
    choices: [...sites, 'Cancel']
  });

  if (target.toLowerCase() !== 'cancel') {
    // nginx
    process.stdout.write(`${chalk.magenta('-')} ${chalk.bold('Removing nginx config...')}`);
    await new Promise(r => rimraf(`${nginxDir}/${target}.conf`, r));
    console.log(`${chalk.bold.green('Sucess')}`);

    // acme
    process.stdout.write(`${chalk.magenta('-')} ${chalk.bold('Removing acme config...')}`);
    await new Promise(r => rimraf(`${acmeDir}/${target}`, r));
    console.log(`${chalk.bold.green('Sucess')}`);
    sites.splice(sites.indexOf(target), 1);
  }
}


async function EnableCron() {
  console.log(chalk.bold.gray('\n  Enable CRON'));
  const opts = await inquirer.prompt([{
    message: 'Cron schedule: ',
    name: 'schedule',
    type: 'input',
    default: '0 0 * * *'
  }, {
    message: 'Any additional params?',
    name: 'extra',
    type: 'input'
  }, {
    message: 'This will overwrite all existing cron jobs for the root user. Are you sure?',
    name: 'confirmation',
    type: 'list',
    choices: ['Yes', 'No']
  }]);

  if (opts.confirmation.toLowerCase() === 'yes') {
    const nodePath = path.resolve( `${nodeDir}/node`);
    const scriptPath = path.resolve(__filename);

    process.stdout.write(`${chalk.magenta('-')} ${chalk.bold('Updating CRON...')}`);

    await new Promise(async done => {
      const cron = proc.spawn('crontab');
      cron.on('close', done);
      cron.stdin.write(`${opts.schedule} ${nodePath} ${scriptPath} --cron ${opts.extra}\n`, () => cron.stdin.end());
    });

    console.log(`${chalk.bold.green('Sucess')}`);
  }
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
  proc.spawn('sudo', process.argv, { stdio: 'inherit' });
}