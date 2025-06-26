{ pkgs }: {
  channel = "stable-24.11";

  packages = [
    pkgs.nodejs_20
    pkgs.zulu
  ];

  env = {};

  services.firebase.emulators = {
    detect = true;
    projectId = "demo-app";
    services = ["auth" "firestore"];
  };

  idx = {
    extensions = [
      # "vscodevim.vim"
    ];
    workspace = {
      onCreate = {
        default.openFiles = [
          "src/app/page.tsx"
        ];
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npm" "run" "dev"];
          manager = "web";
        };
      };
    };
  };
}
