region = "us-west-2"
env = "dev"
project = "fds"

cognito-callback-urls = ["http://localhost:9000/login/index.html", "http://localhost:5173/login", "https://dev.breathstudy.org/login/index.html"]
cognito-logout-url = ["http://localhost:9000/logout/success", "https://dev.breathstudy.org/logout/success"]
cognito-redirect-uri = "http://localhost:9000/login/index.html"

data-bucket = "fds-dev-usr-data"
