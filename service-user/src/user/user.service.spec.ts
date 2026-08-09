import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { of } from 'rxjs';

describe('UserService', () => {
  let service: UserService;
  let repository: UserRepository;

  // 1. Create a mock version of our database repository
  const mockUserRepository = {
    upsertUser: jest.fn(),
  };

  // 2. Create a mock version of the ClientGrpc
  const mockClientGrpc = {
    getService: jest.fn().mockReturnValue({
      parseResume: jest.fn().mockReturnValue(of({ success: true, skills: ['Python', 'Java'] })),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mockUserRepository, // Inject the mock instead of the real repository
        },
        {
          provide: 'RESUME_PACKAGE',
          useValue: mockClientGrpc, // Inject the mock instead of the real gRPC client
        }
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<UserRepository>(UserRepository);
  });

  it('should successfully sync a user', async () => {
    const mockUserData = { id: 'firebase-uid-123', email: 'test@example.com' };
    
    // Set up the mock to return a simulated PostgreSQL response
    mockUserRepository.upsertUser.mockResolvedValue({
      id: mockUserData.id,
      email: mockUserData.email,
      passwordHash: 'MANAGED_BY_FIREBASE',
    });

    const result = await service.findOrCreateUser(mockUserData);

    expect(result.email).toEqual('test@example.com');
    // Ensure the service actually called the repository with the correct arguments
    expect(repository.upsertUser).toHaveBeenCalledWith(mockUserData.id, mockUserData.email);
  });
});
