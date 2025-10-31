USE [Imports];
GO

IF OBJECT_ID('dbo.ImportRequests', 'U') IS NOT NULL
    DROP TABLE dbo.ImportRequests;
GO

CREATE TABLE [dbo].[ImportRequests](
    [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [DataKerkeses] DATETIME NOT NULL DEFAULT (GETDATE()), -- request date
    [Importuesi] NVARCHAR(100) NOT NULL,                  -- importer name
    [Artikulli] NVARCHAR(255) NOT NULL,                   -- article name or code
    [NumriPaletave] INT NOT NULL DEFAULT (0),             -- number of pallets
    [Useri] NVARCHAR(100) NULL,                           -- user creating the request
    [Status] NVARCHAR(20) NOT NULL DEFAULT ('pending'),   -- pending/approved/rejected
    [ConfirmedBy] NVARCHAR(100) NULL,                     -- who confirmed
    [CreatedAt] DATETIME NOT NULL DEFAULT (GETDATE())     -- creation timestamp
);
GO
