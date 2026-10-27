# Interactive shell niceties for the admin user (busybox ash)
export PAGER=less
PS1='\u@\h:\w\$ '
alias ll='ls -lh'
alias logs='svc log'
