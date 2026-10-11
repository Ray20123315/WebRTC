$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$provider=[System.Security.Cryptography.CngProvider]::new('Microsoft Platform Crypto Provider')
$keyName='WebRTCWatermarkSource-v1'
try {
 if([System.Security.Cryptography.CngKey]::Exists($keyName,$provider)){
  $key=[System.Security.Cryptography.CngKey]::Open($keyName,$provider)
 }else{
  $parameters=[System.Security.Cryptography.CngKeyCreationParameters]::new()
  $parameters.Provider=$provider
  $parameters.KeyUsage=[System.Security.Cryptography.CngKeyUsages]::Signing
  $parameters.ExportPolicy=[System.Security.Cryptography.CngExportPolicies]::None
  $parameters.Parameters.Add([System.Security.Cryptography.CngProperty]::new('Length',[BitConverter]::GetBytes([int]2048),[System.Security.Cryptography.CngPropertyOptions]::None))
  $key=[System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa,$keyName,$parameters)
 }
 $rsa=[System.Security.Cryptography.RSACng]::new($key)
 $pub=$rsa.ExportParameters($false)
 function Base64Url([byte[]]$value){return [Convert]::ToBase64String($value).TrimEnd('=').Replace('+','-').Replace('/','_')}
 $privateExportBlocked=$false
 try {$discard=$rsa.ExportParameters($true)}catch{$privateExportBlocked=$true}
 if(-not $privateExportBlocked){throw 'Private key unexpectedly exportable'}
 [Console]::WriteLine((@{ready=$true;provider=$key.Provider.Provider;jwk=@{kty='RSA';n=(Base64Url $pub.Modulus);e=(Base64Url $pub.Exponent)};privateExportBlocked=$true}|ConvertTo-Json -Compress -Depth 4))
 while($null -ne ($line=[Console]::ReadLine())){
  $data=[Convert]::FromBase64String($line)
  $signature=$rsa.SignData($data,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
  [Console]::WriteLine([Convert]::ToBase64String($signature))
 }
}catch{
 [Console]::WriteLine((@{ready=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress))
 exit 1
}finally{
 if($rsa){$rsa.Dispose()};if($key){$key.Dispose()}
}
