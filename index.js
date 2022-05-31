const os = require('os');
const fs = require('fs');
const proc = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');

const nginxDir = '/etc/nginx/sites-enabled';
const certsDir = '/etc/nginx/certs';
const acmeDir = '/etc/acme';

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
}

async function viewSite(site){
  console.log(chalk.blueBright(site));
  const config = await fs.promises.readFile(`${nginxDir}/${site}`, 'utf-8');
  console.log(config);
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