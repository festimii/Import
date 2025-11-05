USE [Imports];
GO

IF OBJECT_ID('dbo.ImportRequests', 'U') IS NOT NULL
    DROP TABLE dbo.ImportRequests;
GO

CREATE TABLE [dbo].[ImportRequests](
    [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [DataKerkeses] DATETIME NOT NULL DEFAULT (GETDATE()), -- request date
    [DataArritjes] DATETIME NULL,                          -- arrival date
    [Importuesi] NVARCHAR(100) NOT NULL,                  -- importer name
    [Artikulli] NVARCHAR(255) NOT NULL,                   -- article name or code
    [NumriPakove] INT NOT NULL DEFAULT (0),               -- number of boxes (Sasia - Pako)
    [NumriPaletave] INT NOT NULL DEFAULT (0),             -- total pallet positions (calculated)
    [BoxesPerPallet] DECIMAL(18, 6) NULL,
    [BoxesPerLayer] DECIMAL(18, 6) NULL,
    [LayersPerPallet] DECIMAL(18, 6) NULL,
    [FullPallets] DECIMAL(18, 6) NULL,
    [RemainingBoxes] DECIMAL(18, 6) NULL,
    [PalletWeightKg] DECIMAL(18, 6) NULL,
    [PalletVolumeM3] DECIMAL(18, 6) NULL,
    [BoxWeightKg] DECIMAL(18, 6) NULL,
    [BoxVolumeM3] DECIMAL(18, 6) NULL,
    [PalletVolumeUtilization] DECIMAL(18, 6) NULL,
    [WeightFullPalletsKg] DECIMAL(18, 6) NULL,
    [VolumeFullPalletsM3] DECIMAL(18, 6) NULL,
    [WeightRemainingKg] DECIMAL(18, 6) NULL,
    [VolumeRemainingM3] DECIMAL(18, 6) NULL,
    [TotalShipmentWeightKg] DECIMAL(18, 6) NULL,
    [TotalShipmentVolumeM3] DECIMAL(18, 6) NULL,
    [Comment] NVARCHAR(1000) NULL,                        -- optional requester comment
    [Useri] NVARCHAR(100) NULL,                           -- user creating the request
    [Status] NVARCHAR(20) NOT NULL DEFAULT ('pending'),   -- pending/approved/rejected
    [ConfirmedBy] NVARCHAR(100) NULL,                     -- who confirmed
    [CreatedAt] DATETIME NOT NULL DEFAULT (GETDATE())     -- creation timestamp
);
GO

IF OBJECT_ID('dbo.RequestNotifications', 'U') IS NOT NULL
    DROP TABLE dbo.RequestNotifications;
GO

CREATE TABLE [dbo].[RequestNotifications](
    [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [RequestID] INT NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [Message] NVARCHAR(400) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL DEFAULT ('info'),
    [CreatedAt] DATETIME NOT NULL DEFAULT (GETDATE()),
    [ReadAt] DATETIME NULL,
    CONSTRAINT FK_RequestNotifications_ImportRequests
      FOREIGN KEY (RequestID) REFERENCES dbo.ImportRequests(ID)
      ON DELETE CASCADE
);
GO
