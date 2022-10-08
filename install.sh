#!/bin/bash

printf '\033[44;97m[ Proxio Setup ]\033[0m\n'

## Install dependencies
if ! type curl > /dev/null 2>&1;
then
  sudo apt install -y curl
fi

if ! type unzip > /dev/null 2>&1;
then
  sudo apt install -y unzip
fi

## Download proxio
if [ "$1" == '' ] && [ ! -d ./proxio ]
then 
  printf '\033[0;36m\nDownloading proxio\033[0m\n'
  rm -rf ./proxio.zip
  curl -L -o proxio.zip https://github.com/kccarbone/proxio/zipball/master/

  printf '\n'
  unzip proxio.zip
  mv $(find . -type d -name "kccarbone-proxio*" -print -quit) proxio
fi

cd proxio

## Node
printf '\033[0;36m\nChecking Node\033[0m\n'
if ! type node > /dev/null 2>&1; 
then
  curl -sL https://deb.nodesource.com/setup_17.x | sudo bash -
  sudo apt install -y nodejs
  sudo npm update -g npm
  sudo npm update -g node
fi
printf "Node $(node -v) installed\n"
printf "NPM $(npm -v) installed\n"

## Apache
printf '\033[0;36m\nChecking Apache\033[0m\n'
if ! type apache2 > /dev/null 2>&1; 
then
  printf 'Apache not installed... \033[0;32mGood.\033[0m We don''t want that\n'
else
  apacheBin=$(which apache2)
  sudo apt remove -y apache2
  sudo rm -rf $apacheBin
  printf 'Apache removed\n'
fi

## Nginx
printf '\033[0;36m\nChecking Nginx\033[0m\n'
if ! type nginx > /dev/null 2>&1; 
then
  sudo apt install -y nginx
  sudo rm -rf /etc/nginx/sites-enabled/*
fi
printf "$(nginx -v)"

## Acme.sh
printf '\033[0;36m\nChecking acme.sh\033[0m\n'
if sudo [ -f "/root/.acme.sh/acme.sh" ] 
then
  printf 'acme.sh already installed\n'
else
  curl https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh | sudo sh -s -- --install-online --no-profile --no-cron
fi

## Proxio
printf '\033[0;36m\nInstalling app\033[0m\n'
if [ -d "node_modules" ] 
then
  printf 'App already installed\n'
else
  npm install
fi

## Add alias
if ! sudo grep -q '^alias proxio.*' ~/.bash_profile
then 
  echo "alias proxio=\"sudo node $(pwd)/index.js\"" >> ~/.bash_profile
  source ~/.bash_profile
fi

printf '\033[0;32m\nDone!\033[0m Run \033[0;95mproxio\033[0m to get started\n'

if [ "$1" == '' ]
then 
  cd ..
fi