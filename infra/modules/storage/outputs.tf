output "bucket_id" {
  value = aws_s3_bucket.main.id
}

output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.main.bucket_regional_domain_name
}

output "oac_id" {
  value = aws_cloudfront_origin_access_control.s3.id
}
