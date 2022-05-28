#!/bin/bash

printf '\033[44;97m[ Proxio Setup ]\033[0m\n'

if [ "$1" == '' ]
then 
  printf '\033[0;36m\nDownloading proxio\033[0m\n'
  git clone git@github.com:kccarbone/proxio.git
  cd proxio
fi

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
fi
printf "$(nginx -v)\n"

if [ "$1" == '' ]
then 
  cd ..
fi