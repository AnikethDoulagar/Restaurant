# Agent Memory

## AWS Deployment (ECS Fargate)

- **Cluster**: `default`
- **Service**: `restaurants_interface-9565` (Fargate, 1 desired task)
- **ALB**: `ecs-express-gateway-alb-b9f915a8`
  - DNS: `ecs-express-gateway-alb-b9f915a8-1139471970.eu-north-1.elb.amazonaws.com`
  - Accessible via hostname: `re-fac115fa8ee34854b062e22f79d2af48.ecs.eu-north-1.on.aws`
  - HTTPS listener (port 443) with ACM cert
- **Target Groups** (service alternates between them per deployment):
  - `ecs-gateway-tg-ce02c5af7a23c1cc4` (TG-ce02)
  - `ecs-gateway-tg-c2f38f6e30d4c14ef` (TG-c2f38)
- **ECR**: `568844635605.dkr.ecr.eu-north-1.amazonaws.com/restaurants_interface` (immutable tags)
- **EFS**: `fs-0b05641808839f0e5` (DB storage)
- **Region**: `eu-north-1` (Stockholm)
- **DB Path**: `/data/platform.db` (SQLite via better-sqlite3)

## Deployment Process

1. Build: `docker buildx build --platform linux/amd64 -t 568844635605.dkr.ecr.eu-north-1.amazonaws.com/restaurants_interface:<tag> . --push`
2. Register task definition (copy existing, update image tag)
3. Update service: `aws ecs update-service --cluster default --service restaurants_interface-9565 --task-definition default-restaurants_interface-9565:<rev> --force-new-deployment`
4. Canary deployment (3 min bake) takes ~5 min to roll out

## What Was Fixed (Jul 3 2026)

- **Owner delete failing**: `registration_codes.used_by` FK constraint blocked deletion. Fix: delete registration codes referencing the owner before deleting the owner row.
- **Added registration codes UI**: "Reg Codes" sidebar link with generate/list/delete.
- **Error handling**: Added try-catch to all admin routes so DB errors return JSON instead of crashing.

## Notes

- `server/` and `private/` directories at repo root are used by Docker build (NOT `apps/api/`)
- Schema is in `database/schema.sql`, migrations run on every startup in `server/db.js:init()`
- Login code for super admin panel: `13082008`
- ECS Exec is NOT enabled on the service
- The service uses `ECS` deployment controller with canary strategy
