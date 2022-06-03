const os = require('os');
const fs = require('fs');
const proc = require('child_process');
const rimraf = require('rimraf');
const chalk = require('chalk');
const inquirer = require('inquirer');

const nginxDir = '/etc/nginx/sites-enabled';
const certsDir = '/etc/nginx/certs';
const acmeDir = '/etc/acme';
const acctDir = '/root/.acme.sh/ca';

async function run() {
  console.log(chalk.bgRed.white('### Proxio ###\n'));
  const sites = await fs.promises.readdir(nginxDir);

  if (!fs.existsSync(certsDir)) {
    await fs.promises.mkdir(certsDir);
  }
    
  console.log(chalk.blueBright('Current sites:'));
  for (const site of sites) {
    await viewSite(site);
  }

  await mainMenu('What would you like to do?');
}

async function viewSite(site){
  console.log(chalk.blueBright(site));
  const config = await fs.promises.readFile(`${nginxDir}/${site}`, 'utf-8');
  console.log(config);
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

async function acmeCmd(args) {
  const argArray = args.split(' ');
  const options = { stdio: 'inherit' };
  return new Promise(r => proc.spawn(`${acmeDir}/acme.sh`, argArray, options).on('close', r));
}

async function verifyAccount() {
  if (!fs.existsSync(acctDir)) {
    console.log(chalk.bold.gray('\n  Please provide ZeroSSL API creds:'));
    const creds = await inquirer.prompt([
      { name: 'eab-kid', type: 'input' },
      { name: 'eab-hmac-key', type: 'input' },
    ]);

    console.log(`${chalk.magenta('\n-')} ${chalk.bold('Registering account...')}`);
    const exitCode = await acmeCmd(`--force --register-account --server zerossl --eab-kid ${creds['eab-kid']} --eab-hmac-key ${creds['eab-hmac-key']}`);
    console.log('');
    
    if (exitCode !== 0) {
      await new Promise(r => rimraf(acctDir, r));
      console.log(`${chalk.red('#')} ${chalk.bold('Something appears to have gone wrong :(')}`);
      process.exit(1);
    }
  }
}

async function AddSite() {
  await verifyAccount();

  console.log(chalk.bold.gray('\n  New site'));
  const opts = await inquirer.prompt([
    { message: 'Domain name:', name: 'domain', type: 'input' },
    { message: 'Cloudflare token:', name: 'cfToken', type: 'input' },
    { message: 'Cloudflare account ID:', name: 'cfAcct', type: 'input' },
  ]);

  process.env['CF_Token'] = opts.cfToken;
  process.env['CF_Account_ID'] = opts.cfAcct;
  
  console.log(`${chalk.magenta('\n-')} ${chalk.bold('Registering site...')}`);
  const exitCode = await acmeCmd(`--force --issue --dns dns_cf --server zerossl -d ${opts.domain} --fullchainpath ${certsDir}/${opts.domain}.cer --keypath ${certsDir}/${opts.domain}.key`);
  console.log('');
    
  if (exitCode !== 0) {
    console.log(`${chalk.red('#')} ${chalk.bold('Something appears to have gone wrong :(')}`);
  }
}

if (os.userInfo().uid === 0) {
  if (fs.existsSync(nginxDir)) {
    if (fs.existsSync(acmeDir)) {
      run();
    }
    else {
      console.log(`${chalk.bgRed.white(' ERROR! ')} Acme.sh not found! Run ${chalk.magentaBright('/install.sh local')} first`);
    }
  }
  else {
    console.log(`${chalk.bgRed.white(' ERROR! ')} Nginx not found! Run ${chalk.magentaBright('/install.sh local')} first`);
  }
}
else {
  proc.spawn('sudo', ['node', `${__filename}`], { stdio: 'inherit' });
}