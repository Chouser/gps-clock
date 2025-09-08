export GOOGLE_API_KEY="AI...ck"
export S3BUCKET=owntracks-deploymentbucket-12341234
export DOMAIN_WILDCARD="*.mysite.com"
export DOMAIN_NAME="locograph.mysite.com"
export CLOCK_CONFIG=$(jq -cn '
  {handFriend:["aa","bb","cc","dd","ee"],
   labelAngle:{home:0, church:45, work:90, school:130, room:180,
               unknown: 225, error:270, moving:325}}
')
