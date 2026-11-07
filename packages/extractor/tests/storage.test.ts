import { jest } from '@jest/globals';

const mockSend = jest.fn() as jest.Mock<() => Promise<{ $metadata: { httpStatusCode: number } }>>;

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  CopyObjectCommand: jest.fn().mockImplementation((input) => ({ input, type: 'copy' })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
  NoSuchKey: class NoSuchKey extends Error {},
}));

const { S3Client } = await import('@aws-sdk/client-s3');
const { deleteObject, moveObject } = await import('../src/storage.js');

describe('deleteObject', () => {
  const bucket = 'test-bucket';

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
  });

  it('sends a DeleteObjectCommand with the correct bucket and key', async () => {
    const s3 = new S3Client({} as never);
    await deleteObject(s3, bucket, 'raw/photo.jpg');

    expect(mockSend).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [command] = mockSend.mock.calls[0] as any as [{ input: { Bucket: string; Key: string } }];
    expect(command.input).toEqual({ Bucket: bucket, Key: 'raw/photo.jpg' });
  });

  it('propagates errors thrown by the S3 client', async () => {
    mockSend.mockRejectedValue(new Error('Access Denied'));
    const s3 = new S3Client({} as never);

    await expect(deleteObject(s3, bucket, 'raw/photo.jpg')).rejects.toThrow('Access Denied');
  });
});

describe('moveObject', () => {
  it('copies to the new key then deletes the old one', async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } });
    mockSend.mockResolvedValueOnce({ $metadata: { httpStatusCode: 204 } });
    const s3 = new S3Client({} as never);
    await moveObject(s3, 'b', 'raw/x.jpg', 'failed/x.jpg');

    expect(mockSend).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = mockSend.mock.calls as any as Array<[{ input: Record<string, string>; type?: string }]>;
    expect(calls[0]![0].type).toBe('copy');
    expect(calls[0]![0].input).toEqual({
      Bucket: 'b',
      Key: 'failed/x.jpg',
      CopySource: 'b/raw/x.jpg',
    });
    expect(calls[1]![0].input).toEqual({ Bucket: 'b', Key: 'raw/x.jpg' });
  });
});
